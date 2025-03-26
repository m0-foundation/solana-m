import { Program, AnchorError, BN } from "@coral-xyz/anchor";
import { LiteSVM } from "litesvm";
import { fromWorkspace, LiteSVMProvider } from "anchor-litesvm";
import {
    PublicKey,
    Keypair,
    LAMPORTS_PER_SOL,
    SystemProgram,
    Transaction,
} from "@solana/web3.js";
import {
    ACCOUNT_SIZE,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    createInitializeMintInstruction,
    createAssociatedTokenAccountInstruction,
    getAccount,
    getMintLen,
    getMinimumBalanceForRentExemptMultisig,
    getAssociatedTokenAddressSync,
    createInitializeAccountInstruction,
    createInitializeMultisigInstruction,
    createMintToCheckedInstruction,
    getAccountLen,
    createInitializeImmutableOwnerInstruction,
    ExtensionType,
} from "@solana/spl-token";
import { randomInt } from "crypto";

import { loadKeypair } from "../test-utils";
import { Earn } from "../../target/types/earn";
import { ExtEarn } from "../../target/types/ext_earn";
import { MerkleTree, ProofElement } from "../merkle";

const EARN_IDL = require("../../target/idl/earn.json");
const EXT_EARN_IDL = require("../../target/idl/ext_earn.json");

const EARN_PROGRAM_ID = new PublicKey(
    "MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c"
);
const EXT_EARN_PROGRAM_ID = new PublicKey(
    "ATPNKbFx7D5bQaKV4YSsoQePsUpkrihHBHLzPKTPeuzL"
);
// Unit tests for ext earn program

const ZERO_WORD = new Array(32).fill(0);

// Setup wallets once at the beginning of the test suite
const admin: Keypair = loadKeypair("tests/keys/admin.json");
const portal: Keypair = loadKeypair("tests/keys/admin.json");
const mMint: Keypair = loadKeypair("tests/keys/mint.json");
const extMint: Keypair = new Keypair();
const earnAuthority: Keypair = new Keypair();
const mMintAuthority: Keypair = new Keypair();
const nonAdmin: Keypair = new Keypair();

// Create random addresses for testing
const earnerOne: Keypair = new Keypair();
const earnerTwo: Keypair = new Keypair();
const earnManagerOne: Keypair = new Keypair();
const earnManagerTwo: Keypair = new Keypair();
const nonEarnerOne: Keypair = new Keypair();
const nonEarnManagerOne: Keypair = new Keypair();
const yieldRecipient: Keypair = new Keypair();

let svm: LiteSVM;
let provider: LiteSVMProvider;
let accounts: Record<string, PublicKey> = {};
let earn: Program<Earn>;
let extEarn: Program<ExtEarn>;

// Start parameters
const initialSupply = new BN(100_000_000); // 100 tokens with 6 decimals
const initialIndex = new BN(1_000_000_000_000); // 1.0
const claimCooldown = new BN(0); // None

// Type definitions for accounts to make it easier to do comparisons

interface EarnGlobal {
    admin?: PublicKey;
    earnAuthority?: PublicKey;
    mint?: PublicKey;
    index?: BN;
    timestamp?: BN;
    claimCooldown?: BN;
    maxSupply?: BN;
    maxYield?: BN;
    distributed?: BN;
    claimComplete?: boolean;
    earnerMerkleRoot?: number[];
}

interface ExtGlobal {
    admin?: PublicKey;
    earnAuthority?: PublicKey;
    extMint?: PublicKey;
    mMint?: PublicKey;
    mEarnGlobalAccount?: PublicKey;
    index?: BN;
    timestamp?: BN;
    bump?: number;
    mVaultBump?: number;
    extMintAuthorityBump?: number;
}

interface Earner {
    earnManager?: PublicKey;
    recipientTokenAccount?: PublicKey;
    lastClaimIndex?: BN;
    lastClaimTimestamp?: BN;
    user?: PublicKey;
    userTokenAccount?: PublicKey;
    bump?: number;
}

interface EarnManager {
    earnManager?: PublicKey;
    isActive?: boolean;
    feeBps?: BN;
    feeTokenAccount?: PublicKey;
    bump?: number;
}

const getEarnGlobalAccount = () => {
    const [globalAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("global")],
        earn.programId
    );

    return globalAccount;
};

const getEarnTokenAuthority = () => {
    const [earnTokenAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_authority")],
        earn.programId
    );

    return earnTokenAuthority;
};

const getExtGlobalAccount = () => {
    const [globalAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("global")],
        extEarn.programId
    );

    return globalAccount;
};

const getExtMintAuthority = () => {
    const [extMintAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint_authority")],
        extEarn.programId
    );

    return extMintAuthority;
};

const getMVault = () => {
    const [mVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("m_vault")],
        extEarn.programId
    );

    return mVault;
}

const getMEarnerAccount = (tokenAccount: PublicKey) => {
    const [earnerAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("earner"), tokenAccount.toBuffer()],
        earn.programId
    );

    return earnerAccount;
}

const getExtEarnerAccount = (tokenAccount: PublicKey) => {
    const [earnerAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("earner"), tokenAccount.toBuffer()],
        extEarn.programId
    );

    return earnerAccount;
};

const getEarnManagerAccount = (earnManager: PublicKey) => {
    const [earnManagerAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("earn_manager"), earnManager.toBuffer()],
        extEarn.programId
    );

    return earnManagerAccount;
};

// Utility functions for the tests
const expectAccountEmpty = (account: PublicKey) => {
    const accountInfo = svm.getAccount(account);

    if (accountInfo) {
        expect(accountInfo.lamports).toBe(0);
        expect(accountInfo.data.length).toBe(0);
        expect(accountInfo.owner).toStrictEqual(SystemProgram.programId);
    }
};

const expectAnchorError = async (
    txResult: Promise<string>,
    errCode: string
) => {
    try {
        await txResult;
        throw new Error("Transaction should have reverted");
    } catch (e) {
        if (!(e instanceof AnchorError)) throw new Error(`Expected AnchorError, got ${e}`);
        const err: AnchorError = e;
        expect(err.error.errorCode.code).toStrictEqual(errCode);
    }
};

const expectSystemError = async (txResult: Promise<string>) => {
    let reverted = false;
    try {
        await txResult;
    } catch (e) {
        // console.log(e.transactionMessage);
        // console.log(e.logs);
        reverted = true;
    } finally {
        expect(reverted).toBe(true);
    }
};

const expectEarnGlobalState = async (
    globalAccount: PublicKey,
    expected: EarnGlobal
) => {
    const state = await earn.account.global.fetch(globalAccount);

    if (expected.earnAuthority)
        expect(state.earnAuthority).toEqual(expected.earnAuthority);
    if (expected.index)
        expect(state.index.toString()).toEqual(expected.index.toString());
    if (expected.timestamp)
        expect(state.timestamp.toString()).toEqual(expected.timestamp.toString());
    if (expected.claimCooldown)
        expect(state.claimCooldown.toString()).toEqual(
            expected.claimCooldown.toString()
        );
    if (expected.maxSupply)
        expect(state.maxSupply.toString()).toEqual(expected.maxSupply.toString());
    if (expected.maxYield)
        expect(state.maxYield.toString()).toEqual(expected.maxYield.toString());
    if (expected.distributed)
        expect(state.distributed.toString()).toEqual(
            expected.distributed.toString()
        );
    if (expected.claimComplete !== undefined)
        expect(state.claimComplete).toEqual(expected.claimComplete);
    if (expected.earnerMerkleRoot)
        expect(state.earnerMerkleRoot).toEqual(expected.earnerMerkleRoot);
};

const expectExtGlobalState = async (
    globalAccount: PublicKey,
    expected: ExtGlobal
) => {
    const state = await extEarn.account.extGlobal.fetch(globalAccount);

    if (expected.admin) expect(state.admin).toEqual(expected.admin);
    if (expected.earnAuthority)
        expect(state.earnAuthority).toEqual(expected.earnAuthority);
    if (expected.extMint) expect(state.extMint).toEqual(expected.extMint);
    if (expected.mMint) expect(state.mMint).toEqual(expected.mMint);
    if (expected.mEarnGlobalAccount)
        expect(state.mEarnGlobalAccount).toEqual(expected.mEarnGlobalAccount);
    if (expected.index)
        expect(state.index.toString()).toEqual(expected.index.toString());
    if (expected.timestamp)
        expect(state.timestamp.toString()).toEqual(expected.timestamp.toString());
    if (expected.bump) expect(state.bump).toEqual(expected.bump);
    if (expected.mVaultBump) expect(state.mVaultBump).toEqual(expected.mVaultBump);
    if (expected.extMintAuthorityBump) expect(state.extMintAuthorityBump).toEqual(expected.extMintAuthorityBump);
};

const expectEarnerState = async (
    earnerAccount: PublicKey,
    expected: Earner
) => {
    const state = await extEarn.account.earner.fetch(earnerAccount);

    if (expected.earnManager)
        expect(state.earnManager).toEqual(expected.earnManager);
    if (expected.recipientTokenAccount)
        expect(state.recipientTokenAccount).toEqual(expected.recipientTokenAccount);
    if (expected.lastClaimIndex)
        expect(state.lastClaimIndex.toString()).toEqual(
            expected.lastClaimIndex.toString()
        );
    if (expected.lastClaimTimestamp)
        expect(state.lastClaimTimestamp.toString()).toEqual(
            expected.lastClaimTimestamp.toString()
        );
    if (expected.user)
        expect(state.user).toEqual(expected.user);
    if (expected.userTokenAccount)
        expect(state.userTokenAccount).toEqual(expected.userTokenAccount);
};

const expectEarnManagerState = async (
    earnManagerAccount: PublicKey,
    expected: EarnManager
) => {
    const state = await extEarn.account.earnManager.fetch(earnManagerAccount);

    if (expected.earnManager)
        expect(state.earnManager).toEqual(expected.earnManager);
    if (expected.isActive !== undefined)
        expect(state.isActive).toEqual(expected.isActive);
    if (expected.feeBps)
        expect(state.feeBps.toString()).toEqual(expected.feeBps.toString());
    if (expected.feeTokenAccount)
        expect(state.feeTokenAccount).toEqual(expected.feeTokenAccount);
};

const expectTokenBalance = async (
    tokenAccount: PublicKey,
    expectedBalance: BN
) => {
    const balance = (
        await getAccount(
            provider.connection,
            tokenAccount,
            null,
            TOKEN_2022_PROGRAM_ID
        )
    ).amount;

    expect(balance.toString()).toEqual(expectedBalance.toString());
};

const createATA = async (mint: PublicKey, owner: PublicKey) => {
    const tokenAccount = getAssociatedTokenAddressSync(
        mint,
        owner,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const createATA = createAssociatedTokenAccountInstruction(
        admin.publicKey, // payer
        tokenAccount, // ata
        owner, // owner
        mint, // mint
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    let tx = new Transaction().add(createATA);

    await provider.sendAndConfirm(tx, [admin]);

    return tokenAccount;
};

const getATA = async (mint: PublicKey, owner: PublicKey) => {
    // Check to see if the ATA already exists, if so return its key
    const tokenAccount = getAssociatedTokenAddressSync(
        mint,
        owner,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const tokenAccountInfo = svm.getAccount(tokenAccount);

    if (!tokenAccountInfo) {
        await createATA(mint, owner);
    }

    return tokenAccount;
};

const createTokenAccount = async (mint: PublicKey, owner: PublicKey) => {
    // We want to create a token account that is not the ATA
    const tokenAccount = new Keypair();

    let tx = new Transaction();
    tx.add(
        SystemProgram.createAccount({
            fromPubkey: admin.publicKey,
            newAccountPubkey: tokenAccount.publicKey,
            space: ACCOUNT_SIZE,
            lamports: await provider.connection.getMinimumBalanceForRentExemption(
                ACCOUNT_SIZE
            ),
            programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeAccountInstruction(
            tokenAccount.publicKey,
            mint,
            owner,
            TOKEN_2022_PROGRAM_ID
        )
    );

    await provider.sendAndConfirm(tx, [admin, tokenAccount]);

    return { tokenAccount: tokenAccount.publicKey };
};

const createMint = async (mint: Keypair, mintAuthority: PublicKey, use2022: boolean = true) => {
    // Create and initialize mint account

    const tokenProgram = use2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

    const mintLen = getMintLen([]);
    const mintLamports =
        await provider.connection.getMinimumBalanceForRentExemption(mintLen);
    const createMintAccount = SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports: mintLamports,
        programId: tokenProgram
    });

    const initializeMint = createInitializeMintInstruction(
        mint.publicKey,
        6, // decimals
        mintAuthority, // mint authority
        mintAuthority, // freeze authority
        tokenProgram
    );

    let tx = new Transaction();
    tx.add(createMintAccount, initializeMint);

    await provider.sendAndConfirm(tx, [admin, mint]);

    // Verify the mint was created properly
    const mintInfo = await provider.connection.getAccountInfo(mint.publicKey);
    if (!mintInfo) {
        throw new Error("Mint account was not created");
    }

    return mint.publicKey;
};

const createMintWithMultisig = async (
    mint: Keypair,
    mintAuthority: Keypair
) => {
    // Create and initialize multisig mint authority on the token program
    const multisigLen = 355;
    // const multisigLamports = await provider.connection.getMinimumBalanceForRentExemption(multisigLen);
    const multisigLamports = await getMinimumBalanceForRentExemptMultisig(
        provider.connection
    );

    const createMultisigAccount = SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: mintAuthority.publicKey,
        space: multisigLen,
        lamports: multisigLamports,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    const earnTokenAuthority = getEarnTokenAuthority();

    const initializeMultisig = createInitializeMultisigInstruction(
        mintAuthority.publicKey, // account
        [portal, earnTokenAuthority],
        1,
        TOKEN_2022_PROGRAM_ID
    );

    let tx = new Transaction();
    tx.add(createMultisigAccount, initializeMultisig);

    await provider.sendAndConfirm(tx, [admin, mintAuthority]);

    // Create and initialize mint account

    const mintLen = getMintLen([]);
    const mintLamports =
        await provider.connection.getMinimumBalanceForRentExemption(mintLen);
    const createMintWithMultisigAccount = SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports: mintLamports,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeMint = createInitializeMintInstruction(
        mint.publicKey,
        6, // decimals
        mintAuthority.publicKey, // mint authority
        null, // freeze authority
        TOKEN_2022_PROGRAM_ID
    );

    tx = new Transaction();
    tx.add(createMintWithMultisigAccount, initializeMint);

    await provider.sendAndConfirm(tx, [admin, mint]);

    // Verify the mint was created properly
    const mintInfo = await provider.connection.getAccountInfo(mint.publicKey);
    if (!mintInfo) {
        throw new Error("Mint account was not created");
    }

    return mint.publicKey;
};

const mintM = async (to: PublicKey, amount: BN) => {
    const toATA: PublicKey = await getATA(mMint.publicKey, to);

    const mintToInstruction = createMintToCheckedInstruction(
        mMint.publicKey,
        toATA,
        mMintAuthority.publicKey,
        BigInt(amount.toString()),
        6,
        [portal],
        TOKEN_2022_PROGRAM_ID
    );

    let tx = new Transaction();
    tx.add(mintToInstruction);
    await provider.sendAndConfirm(tx, [portal]);
};

const warp = (seconds: BN, increment: boolean) => {
    const clock = svm.getClock();
    clock.unixTimestamp = increment
        ? clock.unixTimestamp + BigInt(seconds.toString())
        : BigInt(seconds.toString());
    svm.setClock(clock);
};

// instruction convenience functions for earn program
const prepEarnInitialize = (signer: Keypair) => {
    // Get the global PDA
    const globalAccount = getEarnGlobalAccount();

    // Populate accounts for the instruction
    accounts = {};
    accounts.admin = signer.publicKey;
    accounts.globalAccount = globalAccount;
    accounts.systemProgram = SystemProgram.programId;

    return { globalAccount };
};

const initializeEarn = async (
    mint: PublicKey,
    earnAuthority: PublicKey,
    initialIndex: BN,
    claimCooldown: BN
) => {
    // Setup the instruction
    const { globalAccount } = prepEarnInitialize(admin);

    // Send the transaction
    await earn.methods
        .initialize(mint, earnAuthority, initialIndex, claimCooldown)
        .accounts({ ...accounts })
        .signers([admin])
        .rpc();

    return globalAccount;
};

const prepPropagateIndex = (signer: Keypair) => {
    // Get the global PDA
    const globalAccount = getEarnGlobalAccount();

    // Populate accounts
    accounts = {};
    accounts.signer = signer.publicKey;
    accounts.globalAccount = globalAccount;
    accounts.mint = mMint.publicKey;

    return { globalAccount };
};

const propagateIndex = async (
    newIndex: BN,
    earnerMerkleRoot: number[] = ZERO_WORD
) => {
    // Setup the instruction
    const { globalAccount } = prepPropagateIndex(portal);

    // Send the instruction
    await earn.methods
        .propagateIndex(newIndex, earnerMerkleRoot)
        .accounts({ ...accounts })
        .signers([portal])
        .rpc();

    // We don't check state here because it depends on the circumstances

    return { globalAccount };
};

const prepMClaimFor = async (
    signer: Keypair,
    mint: PublicKey,
    earner: PublicKey,
    earnManager?: PublicKey
) => {
    // Get the global and token authority PDAs
    const globalAccount = getEarnGlobalAccount();
    const earnTokenAuthority = getEarnTokenAuthority();

    // Get the earner ATA
    const earnerATA = await getATA(mint, earner);

    // Get the earner account
    const earnerAccount = getMEarnerAccount(earnerATA);

    // Populate accounts
    accounts = {};
    accounts.earnAuthority = signer.publicKey;
    accounts.globalAccount = globalAccount;
    accounts.earnerAccount = earnerAccount;
    accounts.mint = mint;
    accounts.mintMultisig = mMintAuthority.publicKey;
    accounts.tokenAuthorityAccount = earnTokenAuthority;
    accounts.userTokenAccount = earnerATA;
    accounts.tokenProgram = TOKEN_2022_PROGRAM_ID;

    if (earnManager) {
        // Get the earn manager ATA
        const earnManagerATA = await getATA(mint, earnManager);

        // Get the earn manager account
        const earnManagerAccount = getEarnManagerAccount(earnManager);

        accounts.earnManagerAccount = earnManagerAccount;
        accounts.earnManagerTokenAccount = earnManagerATA;

        return {
            globalAccount,
            earnerAccount,
            earnerATA,
            earnManagerAccount,
            earnManagerATA,
        };
    } else {
        accounts.earnManagerAccount = null;
        accounts.earnManagerTokenAccount = null;
    }

    return { globalAccount, earnerAccount, earnerATA };
};

const prepCompleteClaims = (signer: Keypair) => {
    // Get the global PDA
    const globalAccount = getEarnGlobalAccount();

    // Populate accounts
    accounts = {};
    accounts.earnAuthority = signer.publicKey;
    accounts.globalAccount = globalAccount;

    return { globalAccount };
};

const completeClaims = async () => {
    // Setup the instruction
    prepCompleteClaims(earnAuthority);

    // Send the instruction
    await earn.methods
        .completeClaims()
        .accounts({ ...accounts })
        .signers([earnAuthority])
        .rpc();
};

const prepAddRegistrarEarner = (signer: Keypair, earnerATA: PublicKey) => {
    // Get the global PDA
    const globalAccount = getEarnGlobalAccount();

    // Get the earner account
    const earnerAccount = getMEarnerAccount(earnerATA);

    // Populate accounts
    accounts = {};
    accounts.signer = signer.publicKey;
    accounts.userTokenAccount = earnerATA;
    accounts.globalAccount = globalAccount;
    accounts.earnerAccount = earnerAccount;
    accounts.systemProgram = SystemProgram.programId;

    return { globalAccount, earnerAccount };
};

const addRegistrarEarner = async (earner: PublicKey, proof: ProofElement[]) => {
    // Get the earner ATA
    const earnerATA = await getATA(mMint.publicKey, earner);

    // Setup the instruction
    prepAddRegistrarEarner(nonAdmin, earnerATA);

    // Send the instruction
    await earn.methods
        .addRegistrarEarner(earner, proof)
        .accounts({ ...accounts })
        .signers([nonAdmin])
        .rpc();
};

const prepRemoveRegistrarEarner = (signer: Keypair, earnerATA: PublicKey) => {
    // Get the global PDA
    const globalAccount = getEarnGlobalAccount();

    // Get the earner account
    const earnerAccount = getMEarnerAccount(earnerATA);

    // Populate accounts
    accounts = {};
    accounts.signer = signer.publicKey;
    accounts.globalAccount = globalAccount;
    accounts.userTokenAccount = earnerATA;
    accounts.earnerAccount = earnerAccount;

    return { globalAccount, earnerAccount };
};

// instruction convenience functions for the ExtEarn program

const prepExtInitialize = (signer: Keypair) => {
    // Get the global PDA
    const globalAccount = getExtGlobalAccount();

    // Populate accounts for the instruction
    accounts = {};
    accounts.admin = signer.publicKey;
    accounts.globalAccount = globalAccount;
    accounts.mMint = mMint.publicKey;
    accounts.extMint = extMint.publicKey;
    accounts.mEarnGlobalAccount = getEarnGlobalAccount();
    accounts.token2022 = TOKEN_2022_PROGRAM_ID;
    accounts.systemProgram = SystemProgram.programId;

    return { globalAccount };
};

const initializeExt = async (earnAuthority: PublicKey) => {
    // Setup the instruction
    const { globalAccount } = prepExtInitialize(admin);

    // Send the transaction
    await extEarn.methods
        .initialize(earnAuthority)
        .accounts({ ...accounts })
        .signers([admin])
        .rpc();

    return globalAccount;
}


const prepSetEarnAuthority = (signer: Keypair) => {
    // Get the global PDA
    const globalAccount = getExtGlobalAccount();

    // Populate accounts for the instruction
    accounts = {};
    accounts.admin = signer.publicKey;
    accounts.globalAccount = globalAccount;

    return { globalAccount };
};

const prepAddEarnManager = async (signer: Keypair, earnManager: PublicKey, feeTokenAccount?: PublicKey) => {
    // Cache the earn manager account so it can be returned
    const earnManagerAccount = getEarnManagerAccount(earnManager);

    // Populate accounts for the instruction
    accounts = {};
    accounts.admin = signer.publicKey;
    accounts.globalAccount = getExtGlobalAccount();
    accounts.earnManagerAccount = earnManagerAccount;
    // If a fee token account is provided, use that
    // Otherwise get the earnManager's ATA from the extMint
    accounts.feeTokenAccount = feeTokenAccount ?? await getATA(extMint.publicKey, earnManager);

    return { earnManagerAccount };
};

const addEarnManager = async (earnManager: PublicKey, feeBps: BN, feeTokenAccount?: PublicKey) => {
    // Setup the instruction
    const { earnManagerAccount } = await prepAddEarnManager(admin, earnManager, feeTokenAccount);

    // Send the instruction
    await extEarn.methods
        .addEarnManager(earnManager, feeBps)
        .accounts({ ...accounts })
        .signers([admin])
        .rpc();

    return { earnManagerAccount };
};

const prepRemoveEarnManager = (signer: Keypair, earnManager: PublicKey) => {
    // Cache the earn manager account
    const earnManagerAccount = getEarnManagerAccount(earnManager);

    // Populate the accounts for the instruction
    accounts = {};
    accounts.admin = signer.publicKey;
    accounts.globalAccount = getExtGlobalAccount();
    accounts.earnManagerAccount = earnManagerAccount;

    return { earnManagerAccount };
};

const removeEarnManager = async (earnManager: PublicKey) => {
    // Setup the instruction
    const { earnManagerAccount } = prepRemoveEarnManager(admin, earnManager);

    // Send the instruction
    await extEarn.methods
        .removeEarnManager()
        .accounts({ ...accounts })
        .signers([admin])
        .rpc();

    return { earnManagerAccount };
};

const prepSync = (signer: Keypair) => {
    // Cache the global account
    const globalAccount = getExtGlobalAccount();

    // Populate the accounts
    accounts = {};
    accounts.earnAuthority = signer.publicKey;
    accounts.mEarnGlobalAccount = getEarnGlobalAccount();
    accounts.globalAccount = globalAccount;

    return { globalAccount };
};

const sync = async () => {
    // Setup the instruction
    prepSync(earnAuthority);

    // Send the instruction
    await extEarn.methods
        .sync()
        .accounts({ ...accounts })
        .signers([earnAuthority])
        .rpc();
};

const prepConfigureEarnManager = async (
    signer: Keypair,
    earnManager: PublicKey,
    feeTokenAccount?: PublicKey
) => {
    // Get the global PDA
    const globalAccount = getExtGlobalAccount();

    // Get the earn manager PDA
    const earnManagerAccount = getEarnManagerAccount(earnManager);

    // Populate accounts
    accounts = {};
    accounts.signer = signer.publicKey;
    accounts.globalAccount = globalAccount;
    accounts.earnManagerAccount = earnManagerAccount;
    accounts.feeTokenAccount = feeTokenAccount; // this can be null, which doesn't update the fee account

    return { globalAccount, earnManagerAccount };
};

const configureEarnManager = async (
    earnManager: Keypair,
    feeBps?: BN,
    feeTokenAccount?: PublicKey
) => {
    // Setup the instruction
    prepConfigureEarnManager(earnManager, earnManager.publicKey, feeTokenAccount);

    // Send the instruction
    await extEarn.methods
        .configureEarnManager(feeBps)
        .accounts({ ...accounts })
        .signers([earnManager])
        .rpc();
};

const prepAddEarner = (
    signer: Keypair,
    earnManager: PublicKey,
    earnerATA: PublicKey
) => {
    // Get the global PDA
    const globalAccount = getExtGlobalAccount();

    // Get the earn manager account
    const earnManagerAccount = getEarnManagerAccount(earnManager);

    // Get the earner account
    const earnerAccount = getExtEarnerAccount(earnerATA);

    // Populate accounts
    accounts = {};
    accounts.signer = signer.publicKey;
    accounts.earnManagerAccount = earnManagerAccount;
    accounts.globalAccount = globalAccount;
    accounts.userTokenAccount = earnerATA;
    accounts.earnerAccount = earnerAccount;
    accounts.systemProgram = SystemProgram.programId;

    return { globalAccount, earnManagerAccount, earnerAccount };
};

const addEarner = async (
    earnManager: Keypair,
    earner: PublicKey
) => {
    // Get the earner ATA
    const earnerATA = await getATA(extMint.publicKey, earner);

    // Setup the instruction
    prepAddEarner(earnManager, earnManager.publicKey, earnerATA);

    // Send the instruction
    await extEarn.methods
        .addEarner(earner)
        .accounts({ ...accounts })
        .signers([earnManager])
        .rpc();
};

const prepRemoveEarner = (
    signer: Keypair,
    earnManager: PublicKey,
    earnerATA: PublicKey
) => {
    // Get the earn manager account
    const earnManagerAccount = getEarnManagerAccount(earnManager);

    // Get the earner account
    const earnerAccount = getExtEarnerAccount(earnerATA);

    // Populate accounts
    accounts = {};
    accounts.signer = signer.publicKey;
    accounts.userTokenAccount = earnerATA;
    accounts.earnManagerAccount = earnManagerAccount;
    accounts.earnerAccount = earnerAccount;

    return { earnManagerAccount, earnerAccount };
};

const removeEarner = async (earnManager: Keypair, earner: PublicKey) => {
    // Get the earner ATA
    const earnerATA = await getATA(extMint.publicKey, earner);

    // Setup the instruction
    prepRemoveEarner(earnManager, earnManager.publicKey, earnerATA);

    // Send the instruction
    await extEarn.methods
        .removeEarner()
        .accounts({ ...accounts })
        .signers([earnManager])
        .rpc();
};

const prepTransferEarner = (
    signer: Keypair,
    fromEarnManager: PublicKey,
    toEarnManager: PublicKey,
    earnerATA: PublicKey
) => {
    // Cache the earner account
    const earnerAccount = getExtEarnerAccount(earnerATA);

    // Populate the accounts
    accounts = {};
    accounts.signer = signer.publicKey;
    accounts.earnerAccount = earnerAccount;
    accounts.fromEarnManagerAccount = getEarnManagerAccount(fromEarnManager);
    accounts.toEarnManagerAccount = getEarnManagerAccount(toEarnManager);

    return { earnerAccount };
};

const transferEarner = async (
    fromEarnManager: Keypair,
    toEarnManager: PublicKey,
    earner: PublicKey
) => {
    const earnerATA = await getATA(extMint.publicKey, earner);

    // Setup the instruction
    prepTransferEarner(fromEarnManager, fromEarnManager.publicKey, toEarnManager, earnerATA);

    // Send the instruction
    await extEarn.methods
        .transferEarner(toEarnManager)
        .accounts({ ...accounts })
        .signers([fromEarnManager])
        .rpc();
};

const prepRemoveOrphanedEarner = (
    signer: Keypair,
    earnerATA: PublicKey,
    earnManager?: PublicKey
) => {
    // Get the earner account
    const earnerAccount = getExtEarnerAccount(earnerATA);

    // Populate accounts
    accounts = {};
    accounts.signer = signer.publicKey;
    accounts.userTokenAccount = earnerATA;
    accounts.earnerAccount = earnerAccount;
    if (earnManager) {
        // Get the earn manager account
        const earnManagerAccount = getEarnManagerAccount(earnManager);
        accounts.earnManagerAccount = earnManagerAccount;

        return { earnerAccount, earnManagerAccount };
    }

    return { earnerAccount };
};

describe("ExtEarn unit tests", () => {
    let currentTime: () => BN;

    beforeEach(async () => {
        // Initialize the SVM instance with all necessary configurations
        svm = fromWorkspace("")
            .withSplPrograms() // Add SPL programs (including token programs)
            .withBuiltins() // Add builtin programs
            .withSysvars() // Setup standard sysvars
            .withPrecompiles() // Add standard precompiles
            .withBlockhashCheck(true); // Optional: disable blockhash checking for tests

        // Create an anchor provider from the liteSVM instance
        provider = new LiteSVMProvider(svm);

        // Create program instances
        earn = new Program<Earn>(EARN_IDL, EARN_PROGRAM_ID, provider);
        extEarn = new Program<ExtEarn>(EXT_EARN_IDL, EXT_EARN_PROGRAM_ID, provider);

        // Fund the wallets
        svm.airdrop(admin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
        svm.airdrop(portal.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
        svm.airdrop(earnAuthority.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
        svm.airdrop(nonAdmin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
        svm.airdrop(earnManagerOne.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
        svm.airdrop(earnManagerTwo.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
        svm.airdrop(nonEarnManagerOne.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

        currentTime = () => {
            return new BN(svm.getClock().unixTimestamp.toString());
        }

        // Create the M token mint
        await createMintWithMultisig(mMint, mMintAuthority);

        // Create the Ext token mint
        await createMint(extMint, getExtMintAuthority());

        // Mint some m tokens to have a non-zero supply
        await mintM(admin.publicKey, initialSupply);

        // Initialize the earn program
        await initializeEarn(mMint.publicKey, earnAuthority.publicKey, initialIndex, claimCooldown);

        // Add the m vault as an M earner
        const mVault = getMVault();
        const earnerMerkleTree = new MerkleTree([admin.publicKey, mVault]);

        // Propagate the merkle root
        await propagateIndex(initialIndex, earnerMerkleTree.getRoot());

        // Add the earner account for the vault
        const { proof } = earnerMerkleTree.getInclusionProof(mVault);
        await addRegistrarEarner(mVault, proof);
    });

    describe("admin instruction unit tests", () => {

        describe("initialize unit tests", () => {
            // test cases
            // [X] given the m_mint is not owned by the token2022 program
            //   [X] it reverts with a TokenProgram error
            // [X] given the ext_mint is not owned by the token2022 program
            //   [X] it reverts with a TokenProgram error
            // [X] given the M earn global account does not match the PDA on the earn program
            //   [X] it reverts with a SeedsConstraint error
            // [X] given all accounts are correct
            //   [X] the global account is created
            //   [X] the admin is set to the signer
            //   [X] the m_mint is set correctly
            //   [X] the ext_mint is set correctly
            //   [X] the m_earn_global_account is set correctly
            //   [X] the earn authority is set correctly
            //   [X] the initial index is set correctly
            //   [X] the bumps are set correctly

            // given the m_mint is not owned by the token2022 program
            // it reverts with a TokenProgram error
            test("m_mint not owned by token2022 - reverts", async () => {
                // Create a mint owned by a different program
                const wrongMint = new Keypair();
                await createMint(wrongMint, nonAdmin.publicKey, false);

                // Setup the instruction call
                prepExtInitialize(nonAdmin);

                // Change the M mint
                accounts.mMint = wrongMint.publicKey;

                // Attempt to send the transaction
                await expectAnchorError(
                    extEarn.methods
                        .initialize(earnAuthority.publicKey)
                        .accounts({ ...accounts })
                        .signers([nonAdmin])
                        .rpc(),
                    "ConstraintTokenTokenProgram"
                );
            });

            // given the ext_mint is not owned by the token2022 program
            // it reverts with a TokenProgram error
            test("ext_mint not owned by token2022 - reverts", async () => {
                // Create a mint owned by a different program
                const wrongMint = new Keypair();
                await createMint(wrongMint, nonAdmin.publicKey, false);

                // Setup the instruction call
                prepExtInitialize(nonAdmin);

                // Change the Ext Mint
                accounts.extMint = wrongMint.publicKey;

                // Attempt to send the transaction
                await expectAnchorError(
                    extEarn.methods
                        .initialize(earnAuthority.publicKey)
                        .accounts({ ...accounts })
                        .signers([nonAdmin])
                        .rpc(),
                    "ConstraintTokenTokenProgram"
                );
            });

            // given the M earn global account is invalid
            // it reverts with a seeds constraint
            test("m_earn_global_account is incorrect - reverts", async () => {
                // Setup the instruction call
                prepExtInitialize(nonAdmin);

                // Change the m earn global account
                accounts.mEarnGlobalAccount = PublicKey.unique();
                if (accounts.mEarnGlobalAccount == getEarnGlobalAccount()) return;

                // Attempt to send transaction
                // Expect error (could be one of several "SeedsConstraint", "AccountOwnedByWrongProgram", "AccountNotInitialized")
                await expectSystemError(
                    extEarn.methods
                        .initialize(earnAuthority.publicKey)
                        .accounts({ ...accounts })
                        .signers([nonAdmin])
                        .rpc()
                );
            });

            // given all the accounts are correct
            // the global account is created and configured correctly
            test("initialize - success", async () => {
                // Setup the instruction call
                const { globalAccount } = prepExtInitialize(admin);

                // Create and send the transaction
                await extEarn.methods
                    .initialize(earnAuthority.publicKey)
                    .accounts({ ...accounts })
                    .signers([admin])
                    .rpc();

                // Calculate the expected bumps
                const [, globalBump] = PublicKey.findProgramAddressSync(
                    [Buffer.from("global")],
                    EXT_EARN_PROGRAM_ID
                );
                const [, mVaultBump] = PublicKey.findProgramAddressSync(
                    [Buffer.from("m_vault")],
                    EXT_EARN_PROGRAM_ID
                );
                const [, extMintAuthorityBump] = PublicKey.findProgramAddressSync(
                    [Buffer.from("mint_authority")],
                    EXT_EARN_PROGRAM_ID
                );

                await expectExtGlobalState(globalAccount, {
                    admin: admin.publicKey,
                    mMint: mMint.publicKey,
                    extMint: extMint.publicKey,
                    earnAuthority: earnAuthority.publicKey,
                    index: initialIndex,
                    timestamp: new BN(svm.getClock().unixTimestamp.toString()),
                    bump: globalBump,
                    mVaultBump,
                    extMintAuthorityBump,
                });
            });
        });

        describe("set_earn_authority unit tests", () => {
            // test cases
            //   [X] given the admin signs the transaction
            //      [X] the earn authority is updated
            //   [X] given a non-admin signs the transaction
            //      [X] the transaction reverts with a not authorized error

            beforeEach(async () => {
                // Initialize the program
                await initializeExt(earnAuthority.publicKey);
            });

            test("Admin can set new earn authority", async () => {
                // Setup new earn authority
                const newEarnAuthority = new Keypair();

                // Setup the instruction
                const { globalAccount } = prepSetEarnAuthority(admin);

                // Send the transaction
                await extEarn.methods
                    .setEarnAuthority(newEarnAuthority.publicKey)
                    .accounts({ ...accounts })
                    .signers([admin])
                    .rpc();

                // Verify the global state was updated
                await expectExtGlobalState(globalAccount, {
                    earnAuthority: newEarnAuthority.publicKey,
                });
            });

            test("Non-admin cannot set earn authority", async () => {
                // Attempt to set new earn authority with non-admin
                const newEarnAuthority = new Keypair();

                prepSetEarnAuthority(nonAdmin);

                await expectAnchorError(
                    extEarn.methods
                        .setEarnAuthority(newEarnAuthority.publicKey)
                        .accounts({ ...accounts })
                        .signers([nonAdmin])
                        .rpc(),
                    "NotAuthorized"
                );
            });
        });

        describe("add_earn_manager unit tests", () => {
            // test cases
            // [X] given the admin doesn't sign the transaction
            //   [X] it reverts with a NotAuthorized error
            // [X] given the admin does sign the transaction
            //   [X] given the fee token account is for the wrong mint
            //     [X] it reverts with a ConstraintTokenMint error
            //   [X] given the fee is higher than 100%
            //     [X] it reverts with an InvalidParam error
            //   [ ] given all the accounts and inputs are correct
            //     [ ] it initializes an EarnManager account with
            //       [ ] the earn manager key
            //       [ ] is_active flag set to true
            //       [ ] fee_bps that was input
            //       [ ] fee_token_account that was provided
            //       [ ] the account's bump
            //   [ ] given the account already exists
            //     [ ] it sets the account data again

            beforeEach(async () => {
                // Initialize the program
                await initializeExt(earnAuthority.publicKey);
            });

            // given the admin does not sign the transaction
            // it reverts with a NotAuthorized error
            test("admin does not sign transaction - reverts", async () => {
                // Setup the instruction with a non-admin signer
                await prepAddEarnManager(nonAdmin, earnManagerOne.publicKey);

                // Attempt to send the transaction
                // expect a NotAuthorized error
                await expectAnchorError(
                    extEarn.methods
                        .addEarnManager(earnManagerOne.publicKey, new BN(0))
                        .accounts({ ...accounts })
                        .signers([nonAdmin])
                        .rpc(),
                    "NotAuthorized"
                );
            });

            // given the admin does sign the transaction
            // given the fee token account is for the wrong mint
            // it reverts with a ConstraintTokenMint error
            test("fee_token_account is for the wrong mint - reverts", async () => {
                // Create an ATA for the wrong mint
                const earnManagerMATA = await getATA(mMint.publicKey, earnManagerOne.publicKey);

                // Setup the instruction
                await prepAddEarnManager(admin, earnManagerOne.publicKey, earnManagerMATA);

                // Attempt to send the transaction
                // expect a TokenMint error
                await expectAnchorError(
                    extEarn.methods
                        .addEarnManager(earnManagerOne.publicKey, new BN(0))
                        .accounts({ ...accounts })
                        .signers([admin])
                        .rpc(),
                    "ConstraintTokenMint"
                );
            });


            // given the admin does sign the transaction
            // given the fee is higher than 100% (in basis points)
            // it reverts with an InvalidParam error
            test("fee higher than 100% - reverts", async () => {
                // Setup the instruction
                await prepAddEarnManager(admin, earnManagerOne.publicKey);

                const feeBps = new BN(randomInt(10001, 2 ** 48 - 1));

                // Attempt to send the instruction 
                await expectAnchorError(
                    extEarn.methods
                        .addEarnManager(earnManagerOne.publicKey, feeBps)
                        .accounts({ ...accounts })
                        .signers([admin])
                        .rpc(),
                    "InvalidParam"
                );
            });

            // given the admin does sign the transaction
            // given all the accounts are correct
            // it initializes the earn manager account and sets its data
            test("add_earn_manager - success", async () => {
                // Setup the instruction
                const { earnManagerAccount } = await prepAddEarnManager(admin, earnManagerOne.publicKey);

                const feeBps = new BN(randomInt(0, 10000));

                // Send the transaction
                await extEarn.methods
                    .addEarnManager(earnManagerOne.publicKey, feeBps)
                    .accounts({ ...accounts })
                    .signers([admin])
                    .rpc();

                const [, bump] = PublicKey.findProgramAddressSync(
                    [Buffer.from("earn_manager"), earnManagerOne.publicKey.toBuffer()],
                    EXT_EARN_PROGRAM_ID
                )

                // Check that the state has been updated
                expectEarnManagerState(
                    earnManagerAccount,
                    {
                        earnManager: earnManagerOne.publicKey,
                        isActive: true,
                        feeBps,
                        feeTokenAccount: accounts.feeTokenAccount,
                        bump
                    }
                );
            });

            // given admin does sign the transaction
            // given the account already exists
            // it sets the data again
            test("add_earn_manager again - success", async () => {
                // Add earn manager initially
                await addEarnManager(earnManagerOne.publicKey, new BN(0));

                // Add the earn manager again with a new fee and fee token account
                const newFeeTokenAccount = await getATA(extMint.publicKey, earnManagerTwo.publicKey);
                const feeBps = new BN(10);
                const { earnManagerAccount } = await addEarnManager(earnManagerOne.publicKey, feeBps);

                expectEarnManagerState(
                    earnManagerAccount,
                    {
                        earnManager: earnManagerOne.publicKey,
                        isActive: true,
                        feeBps,
                        feeTokenAccount: accounts.feeTokenAccount,
                    }
                );
            });
        });

        describe("remove_earn_manager unit tests", () => {
            // test cases
            // [ ] given the admin does not sign the transaction
            //   [ ] it reverts with a NotAuthorized error
            // [ ] given the admin does sign the transaction
            //   [ ] it sets the is_active flag on the earn manager account to false

            beforeEach(async () => {
                // Initialize the program
                await initializeExt(earnAuthority.publicKey);

                // Add an earn manager that can be removed
                await addEarnManager(earnManagerOne.publicKey, new BN(0));
            });

            // given the admin does not sign the transaction
            // it reverts with a NotAuthorized error
            test("admin does not sign the transaction - reverts", async () => {
                // Setup the instruction
                await prepRemoveEarnManager(nonAdmin, earnManagerOne.publicKey);

                // Attempt to send the transaction
                // Expect a NotAuthorized error
                await expectAnchorError(
                    extEarn.methods
                        .removeEarnManager()
                        .accounts({ ...accounts })
                        .signers([nonAdmin])
                        .rpc(),
                    "NotAuthorized"
                );
            });

            // given the admin does sign the transaction
            // given the earn manager account is not initialized
            // it reverts with an AccountNotInitialized error
            test("earn_manager_account not initialized - reverts", async () => {
                // Setup the instruction
                await prepRemoveEarnManager(admin, earnManagerTwo.publicKey);

                // Attempt to send the transaction
                // Expect an AccountNotInitialized error
                await expectAnchorError(
                    extEarn.methods
                        .removeEarnManager()
                        .accounts({ ...accounts })
                        .signers([admin])
                        .rpc(),
                    "AccountNotInitialized"
                );
            });

            // given the admin does sign the transaction
            // it sets the is_active flag on the earn manager account to false
            test("remove_earn_manager - success", async () => {
                // Setup the instruction
                const { earnManagerAccount } = prepRemoveEarnManager(admin, earnManagerOne.publicKey);

                // Confirm that the account is currently active
                expectEarnManagerState(
                    earnManagerAccount,
                    {
                        isActive: true
                    }
                );

                // Send the instruction
                await extEarn.methods
                    .removeEarnManager()
                    .accounts({ ...accounts })
                    .signers([admin])
                    .rpc();

                // Confirm the account is not active
                expectEarnManagerState(
                    earnManagerAccount,
                    {
                        isActive: false
                    }
                );
            });
        });
    });

    describe("earn_authority instruction tests", () => {
        const newIndex = new BN(1_100_000_000_000); // 1.1
        let startTime: BN;

        beforeEach(async () => {
            // Initialize the program
            await initializeExt(earnAuthority.publicKey);

            startTime = currentTime();

            // Warp time forward an hour
            warp(new BN(3600), true);

            // Update the index on the Earn program
            await propagateIndex(newIndex);
        });

        describe("sync unit tests", () => {
            // test cases
            // [X] given the earn authority does not sign the transaction
            //   [X] it reverts with a NotAuthorized error
            // [X] given the earn authority does sign the transaction
            //   [X] given the m_earn_global_account does not match the stored key
            //     [X] it reverts with an InvalidAccount error
            //   [X] given all accounts are correct
            //     [X] it updates the ExtGlobal index and timestamp to the current index and timestamp on the M Earn Global account

            // given the earn authority does not sign the transaction
            // it reverts with a NotAuthorized error
            test("earn_authority does not sign - reverts", async () => {
                // Setup the instruction
                prepSync(nonAdmin);

                // Attempt to send the transaction
                // Expect it to revert with a NotAuthorized error
                await expectAnchorError(
                    extEarn.methods
                        .sync()
                        .accounts({ ...accounts })
                        .signers([nonAdmin])
                        .rpc(),
                    "NotAuthorized"
                );
            });

            // given the earn authority does sign the transaction
            // given the m_earn_global_account does not match the stored key
            // it reverts with a variety of errors (AccountNotInitialized, AccountOwnedByWrongProgram, InvalidAccount)
            test("m_earn_global_account is invalid - reverts", async () => {
                // Setup the instruction
                prepSync(earnAuthority);

                // Use an incorrect account
                const wrongAccount = PublicKey.unique();
                if (accounts.mEarnGlobalAccount == wrongAccount) return;
                accounts.mEarnGlobalAccount = wrongAccount;

                // Attempt to send the transaction
                // Expect it to revert with an error
                await expectSystemError(
                    extEarn.methods
                        .sync()
                        .accounts({ ...accounts })
                        .signers([earnAuthority])
                        .rpc()
                );
            });

            // given the earn authority does sign the transaction
            // given all the accounts are correct
            // it updates the index and timestamp of the ExtGlobal account
            test("sync - success", async () => {
                // Setup the instruction
                const { globalAccount } = prepSync(earnAuthority);

                // Confirm the state of the ExtGlobal account before the sync
                await expectExtGlobalState(
                    globalAccount,
                    {
                        index: initialIndex,
                        timestamp: startTime,
                    }
                );

                // Confirm the state of the EarnGlobal account before the sync
                await expectEarnGlobalState(
                    getEarnGlobalAccount(),
                    {
                        index: newIndex,
                        timestamp: currentTime()
                    }
                );

                // Send the transaction
                await extEarn.methods
                    .sync()
                    .accounts({ ...accounts })
                    .signers([earnAuthority])
                    .rpc();

                // Expect the ExtGlobal state to be updated
                await expectExtGlobalState(
                    globalAccount,
                    {
                        index: newIndex,
                        timestamp: currentTime()
                    }
                );
            });
        });

        describe("claim_for unit tests", () => {
            // test cases
            // [ ] given the earn authority does not sign the transaction
            //   [ ] it reverts with a NotAuthorized error
            // [ ] given the earn authority does sign the transaction
            //   [ ] given the wrong ext_mint account is provided
            //     [ ] it reverts with an error (could be various depending on the account)
            //   [ ] should we check more account conditions?
            //   [ ] given the accounts are all correct
            //     [ ] given the earner's last claim index is greater than or equal to the current global index
            //       [ ] it reverts with an AlreadyClaimed error
            //     [ ] given the M vault does not have enough M to mint the rewards against 
            //        (e.g. the yield for the vault hasn't been claimed yet or the provided balance is too high)
            //       [ ] it reverts with an InsufficientCollateral error
            //     [ ] given the earn manager has zero fee
            //       [ ] it mints all of the rewards to the earner's token account
            //     [ ] given the earn manager is not active and has a non-zero fee
            //       [ ] it mints all of the rewards to the earner's token account
            //     [ ] given the earn manager is active and has a non-zero fee
            //       [ ] given the fee on the current yield rounds to zero
            //         [ ] it mints all of the rewards to the earner's token account
            //       [ ] given the fee does not round to zero
            //         [ ] it mints the fee to the earn manager's token account and the remaining rewards
            //             to the earner's token account
            //

        });
    });

    describe("earn_manager instruction tests", () => {
        beforeEach(async () => {
            // Initialize the program
            await initializeExt(earnAuthority.publicKey);

            // Add an earn manager
            await addEarnManager(earnManagerOne.publicKey, new BN(0));

            // Add an earner
            await addEarner(earnManagerOne, earnerOne.publicKey);
        });

        describe("add_earner unit tests", () => {
            // test cases
            // [X] given signer does not have an earn manager account initialized
            //   [X] it reverts with an account not initialized error
            // [X] given signer has an earn manager account initialized
            //   [X] given earn manager account is not active
            //     [X] it reverts with a NotAuthorized error
            //   [X] given earn manager account is active
            //     [X] given the earner already has an earner account
            //       [X] it reverts with an account already initialized error
            //     [X] given the earner does not already have an earner account
            //       [X] given user token account is for the wrong token mint
            //         [X] it reverts with an address constraint error
            //       [X] given user token account authority does not match the user pubkey
            //         [X] it reverts with an address constraint error
            //       [X] given the user token account is for the correct token mint and the authority is the user pubkey
            //         [X] it creates the earner account
            //         [X] it sets the user to the provided pubkey
            //         [X] it sets the user_token_account to the provided token account
            //         [X] it sets the earner is_active flag to true
            //         [X] it sets the earn_manager to the provided earn manager pubkey
            //         [X] it sets the last_claim_index to the current index
            //         [X] it sets the last_claim_timestamp to the current timestamp

            // given signer does not have an earn manager account initialized
            // it reverts with an account not initialized error
            test("Signer earn manager account not initialized - reverts", async () => {
                // Get the ATA for earner two
                const earnerTwoATA = await getATA(
                    extMint.publicKey,
                    earnerTwo.publicKey
                );

                // Setup the instruction
                prepAddEarner(
                    nonEarnManagerOne,
                    nonEarnManagerOne.publicKey,
                    earnerTwoATA
                );

                // Attempt to add earner without an initialized earn manager account
                await expectAnchorError(
                    extEarn.methods
                        .addEarner(nonEarnerOne.publicKey)
                        .accounts({ ...accounts })
                        .signers([nonEarnManagerOne])
                        .rpc(),
                    "AccountNotInitialized"
                );
            });

            // given signer has an earn manager account initialized
            // given earn manager account is not active
            // it reverts with a NotActive error
            test("Signer's earn manager account not active - reverts", async () => {
                // Get the ATA for earner two
                const earnerTwoATA = await getATA(
                    extMint.publicKey,
                    earnerTwo.publicKey
                );

                // Remove the earn manager one's account (set it to inactive)
                await removeEarnManager(earnManagerOne.publicKey);

                // Setup the instruction
                prepAddEarner(earnManagerOne, earnManagerOne.publicKey, earnerTwoATA);

                // Attempt to add earner with an inactive earn manager account
                await expectAnchorError(
                    extEarn.methods
                        .addEarner(earnerTwo.publicKey)
                        .accounts({ ...accounts })
                        .signers([earnManagerOne])
                        .rpc(),
                    "NotActive"
                );
            });

            // given signer has an earn manager account initialized
            // given earn manager account is active
            // given earner already has an earner account
            // it reverts with an account already initialized error
            test("Earner account already initialized - reverts", async () => {
                // Get the ATA for earner one
                const earnerOneATA = await getATA(extMint.publicKey, earnerOne.publicKey);

                // Setup the instruction
                prepAddEarner(earnManagerOne, earnManagerOne.publicKey, earnerOneATA);

                // Attempt to add earner with an already initialized earner account
                await expectSystemError(
                    extEarn.methods
                        .addEarner(earnerOne.publicKey)
                        .accounts({ ...accounts })
                        .signers([earnManagerOne])
                        .rpc()
                );
            });

            // given signer has an earn manager account initialized
            // given earn manager account is active
            // given the earner does not already have an earner account
            // given user token account is for the wrong token mint
            // it reverts with an token mint constraint error
            test("User token account is for the wrong token mint - reverts", async () => {
                // Create a new mint for the user token account
                const wrongMint = new Keypair();
                await createMint(wrongMint, nonAdmin.publicKey);

                // Get the ATA for earner two on the wrong mint
                const earnerTwoATA = await getATA(
                    wrongMint.publicKey,
                    earnerTwo.publicKey
                );

                // Setup the instruction
                prepAddEarner(earnManagerOne, earnManagerOne.publicKey, earnerTwoATA);

                // Attempt to add earner with user token account for wrong token mint
                await expectAnchorError(
                    extEarn.methods
                        .addEarner(earnerTwo.publicKey)
                        .accounts({ ...accounts })
                        .signers([earnManagerOne])
                        .rpc(),
                    "ConstraintTokenMint"
                );
            });

            // given signer has an earn manager account initialized
            // given earn manager account is active
            // given the earner does not already have an earner account
            // given user token account authority does not match the user pubkey
            // it reverts with an address constraint error
            test("User token account authority does not match user pubkey - reverts", async () => {
                // Get the ATA for random user (not the same as the user)
                const randomATA = await getATA(extMint.publicKey, nonAdmin.publicKey);

                // Setup the instruction
                prepAddEarner(earnManagerOne, earnManagerOne.publicKey, randomATA);

                // Attempt to add earner with user token account for wrong token mint
                await expectAnchorError(
                    extEarn.methods
                        .addEarner(earnerTwo.publicKey)
                        .accounts({ ...accounts })
                        .signers([earnManagerOne])
                        .rpc(),
                    "ConstraintTokenOwner"
                );
            });

            test("Add earner with mutable token account - reverts", async () => {
                const tokenAccountKeypair = Keypair.generate();
                const tokenAccountLen = getAccountLen([]);
                const lamports = await provider.connection.getMinimumBalanceForRentExemption(tokenAccountLen);

                // Create token account without the immutable owner extension
                const transaction = new Transaction().add(
                    SystemProgram.createAccount({
                        fromPubkey: earnManagerOne.publicKey,
                        newAccountPubkey: tokenAccountKeypair.publicKey,
                        space: tokenAccountLen,
                        lamports,
                        programId: TOKEN_2022_PROGRAM_ID,
                    }),
                    createInitializeAccountInstruction(
                        tokenAccountKeypair.publicKey,
                        extMint.publicKey,
                        earnerTwo.publicKey,
                        TOKEN_2022_PROGRAM_ID,
                    ),
                );

                await provider.send(transaction, [earnManagerOne, tokenAccountKeypair]);

                // Setup the instruction
                prepAddEarner(
                    earnManagerOne,
                    earnManagerOne.publicKey,
                    tokenAccountKeypair.publicKey
                );

                await expectAnchorError(
                    extEarn.methods
                        .addEarner(earnerTwo.publicKey)
                        .accounts({ ...accounts })
                        .signers([earnManagerOne])
                        .rpc(),
                    "MutableOwner"
                );
            });

            test("Add earner - success", async () => {
                const tokenAccountKeypair = Keypair.generate();
                const tokenAccountLen = getAccountLen([ExtensionType.ImmutableOwner]);
                const lamports = await provider.connection.getMinimumBalanceForRentExemption(tokenAccountLen);

                // Create token account with the immutable owner extension
                const transaction = new Transaction().add(
                    SystemProgram.createAccount({
                        fromPubkey: earnManagerOne.publicKey,
                        newAccountPubkey: tokenAccountKeypair.publicKey,
                        space: tokenAccountLen,
                        lamports,
                        programId: TOKEN_2022_PROGRAM_ID,
                    }),
                    createInitializeImmutableOwnerInstruction(
                        tokenAccountKeypair.publicKey,
                        TOKEN_2022_PROGRAM_ID,
                    ),
                    createInitializeAccountInstruction(
                        tokenAccountKeypair.publicKey,
                        extMint.publicKey,
                        earnerTwo.publicKey,
                        TOKEN_2022_PROGRAM_ID,
                    ),
                );

                await provider.send(transaction, [earnManagerOne, tokenAccountKeypair]);

                // Setup the instruction
                const { earnerAccount } = prepAddEarner(
                    earnManagerOne,
                    earnManagerOne.publicKey,
                    tokenAccountKeypair.publicKey
                );

                // Add earner two to the earn manager's list
                await extEarn.methods
                    .addEarner(earnerTwo.publicKey)
                    .accounts({ ...accounts })
                    .signers([earnManagerOne])
                    .rpc();;

                // Verify the earner account was initialized correctly
                await expectEarnerState(earnerAccount, {
                    earnManager: earnManagerOne.publicKey,
                    lastClaimIndex: initialIndex,
                    lastClaimTimestamp: currentTime(),
                    user: earnerTwo.publicKey,
                    userTokenAccount: tokenAccountKeypair.publicKey,
                });
            });

            // given signer has an earn manager account initialized
            // given earn manager account is active
            // given the earner does not already have an earner account
            // given user token account is for the correct token mint and the authority is the signer
            // it creates the earner account
            // it sets the earner is_active flag to true
            // it sets the earn_manager to the provided earn manager pubkey
            // it sets the last_claim_index to the current index
            // it sets the last_claim_timestamp to the current time
            test("Add earner ata - success", async () => {
                // Get the ATA for earner two
                const earnerTwoATA = await getATA(
                    extMint.publicKey,
                    earnerTwo.publicKey
                );

                // Setup the instruction
                const { earnerAccount } = prepAddEarner(
                    earnManagerOne,
                    earnManagerOne.publicKey,
                    earnerTwoATA
                );

                // Add earner one to the earn manager's list
                await extEarn.methods
                    .addEarner(earnerTwo.publicKey)
                    .accounts({ ...accounts })
                    .signers([earnManagerOne])
                    .rpc();

                // Verify the earner account was initialized correctly
                await expectEarnerState(earnerAccount, {
                    earnManager: earnManagerOne.publicKey,
                    lastClaimIndex: initialIndex,
                    lastClaimTimestamp: currentTime(),
                    user: earnerTwo.publicKey,
                    userTokenAccount: earnerTwoATA,
                });
            });
        });

        describe("configure_earn_manager unit tests", () => {

        });

        describe("remove_earner unit tests", () => {
            // test cases
            // [X] given signer does not have an earn manager account initialized
            //   [X] it reverts with an account not initialized error
            // [X] given signer has an earn manager account initialized
            //   [X] given earn manager account is not active
            //     [X] it reverts with a NotAuthorized error
            //   [X] given earn manager account is active
            //     [X] given the earner account does not have an earn manager
            //       [X] it reverts with a NotAuthorized error
            //     [X] given the earner account has an earn manager
            //       [X] given the earner's earn manager is not the signer
            //         [X] it reverts with a NotAuthorized error
            //       [X] given the earner's earn manager is the signer
            //         [X] the earner account is closed and the signer refunded the rent


            // given signer does not have an earn manager account initialized
            // it reverts with an account not initialized error
            test("Signer earn manager account not initialized - reverts", async () => {
                // Get the ATA for earner one
                const earnerOneATA = await getATA(
                    extMint.publicKey,
                    earnerOne.publicKey
                );

                // Setup the instruction
                prepRemoveEarner(
                    nonEarnManagerOne,
                    nonEarnManagerOne.publicKey,
                    earnerOneATA
                );

                // Attempt to remove earner without an initialized earn manager account
                await expectAnchorError(
                    extEarn.methods
                        .removeEarner()
                        .accounts({ ...accounts })
                        .signers([nonEarnManagerOne])
                        .rpc(),
                    "AccountNotInitialized"
                );
            });

            // given signer has an earn manager account initialized
            // given earn manager account is not active
            // it reverts with a NotActive error
            test("Signer's earn manager account not active - reverts", async () => {
                // Get the ATA for earner one
                const earnerOneATA = await getATA(
                    extMint.publicKey,
                    earnerOne.publicKey
                );

                // Remove the earn manager account (set it to inactive)
                await removeEarnManager(earnManagerOne.publicKey);

                // Setup the instruction
                prepRemoveEarner(
                    earnManagerOne,
                    earnManagerOne.publicKey,
                    earnerOneATA
                );

                // Attempt to remove earner with an inactive earn manager account
                await expectAnchorError(
                    extEarn.methods
                        .removeEarner()
                        .accounts({ ...accounts })
                        .signers([earnManagerOne])
                        .rpc(),
                    "NotActive"
                );
            });

            // given signer has an earn manager account initialized
            // given earn manager account is active
            // given the earner account has an earn manager
            // given the earner's earn manager is not the signer
            // it reverts with a NotAuthorized error
            test("Earner's earn manager is not signer - reverts", async () => {
                // Add earner manager two
                await addEarnManager(earnManagerTwo.publicKey, new BN(100));

                // Get the ATA for earner one
                const earnerOneATA = await getATA(
                    extMint.publicKey,
                    earnerOne.publicKey
                );

                // Setup the instruction
                prepRemoveEarner(
                    earnManagerTwo,
                    earnManagerTwo.publicKey,
                    earnerOneATA
                );

                // Attempt to remove earner with the wrong earn manager
                await expectAnchorError(
                    extEarn.methods
                        .removeEarner()
                        .accounts({ ...accounts })
                        .signers([earnManagerTwo])
                        .rpc(),
                    "NotAuthorized"
                );
            });

            // given signer has an earn manager account initialized
            // given earn manager account is active
            // given the earner account has an earn manager
            // given the earner's earn manager is the signer
            // it closes the earner account and refunds the rent
            test("Earner's earn manager is signer - success", async () => {
                // Get the ATA for earner one
                const earnerOneATA = await getATA(
                    extMint.publicKey,
                    earnerOne.publicKey
                );

                // Setup the instruction
                const { earnerAccount } = prepRemoveEarner(
                    earnManagerOne,
                    earnManagerOne.publicKey,
                    earnerOneATA
                );

                // Remove the earner account
                await extEarn.methods
                    .removeEarner()
                    .accounts({ ...accounts })
                    .signers([earnManagerOne])
                    .rpc();

                // Verify the earner account was closed
                expectAccountEmpty(earnerAccount);
            });
        });

        describe("transfer_earner unit tests", () => {
            // test cases
            // [X] given the earner does not have an account initialized
            //   [X] it reverts with an AccountNotInitialized error
            // [X] given the to earn manager does not have an account initialized
            //   [X] it reverts with an AccountNotInitialized error
            // [X] given the from earn manager does not sign the transaction
            //   [X] it reverts with a NotAuthorized error
            // [X] given the from earn manager does sign the transaction
            //   [X] given the from earn manager is not active
            //     [X] it reverts with a NotActive error
            //   [X] given the to earn manager is not active
            //     [X] it reverts with a NotActive error
            //   [X] given all the accounts are correct and earn managers are active
            //     [X] it updates the earner's earn manager to the "to earn manager"

            beforeEach(async () => {
                // Add second earn manager to have someone to transfer to
                await addEarnManager(earnManagerTwo.publicKey, new BN(100));
            });

            // given the earner does not have an account initialized
            // it reverts with an AccounbtNotInitialized error
            test("earner account not initialized - reverts", async () => {
                const nonEarnerOneATA = await getATA(
                    extMint.publicKey,
                    nonEarnerOne.publicKey
                );

                // Setup the instruction
                prepTransferEarner(
                    earnManagerOne,
                    earnManagerOne.publicKey,
                    earnManagerTwo.publicKey,
                    nonEarnerOneATA
                );

                // Attempt to transfer earner without an initialized account
                await expectAnchorError(
                    extEarn.methods
                        .transferEarner(earnManagerTwo.publicKey)
                        .accounts({ ...accounts })
                        .signers([earnManagerOne])
                        .rpc(),
                    "AccountNotInitialized"
                );
            });

            // given the to earn manager does not have an account initialized
            // it reverts with an AccountNotInitialized error
            test("to_earn_manager account not initialized - reverts", async () => {
                const earnerOneATA = await getATA(extMint.publicKey, earnerOne.publicKey);

                // Setup the instruction
                prepTransferEarner(
                    earnManagerOne,
                    earnManagerOne.publicKey,
                    nonEarnManagerOne.publicKey,
                    earnerOneATA
                );

                // Attempt to transfer earner to a non-initialized earn manager account
                await expectAnchorError(
                    extEarn.methods
                        .transferEarner(nonEarnManagerOne.publicKey)
                        .accounts({ ...accounts })
                        .signers([earnManagerOne])
                        .rpc(),
                    "AccountNotInitialized"
                );
            });

            // given the from earn manager does not sign the transaction
            // it reverts with a NotAuthorized error
            test("from earn manager does not sign transaction - reverts", async () => {
                const earnerOneATA = await getATA(extMint.publicKey, earnerOne.publicKey);

                // Setup the instruction
                prepTransferEarner(
                    nonAdmin,
                    earnManagerOne.publicKey,
                    earnManagerTwo.publicKey,
                    earnerOneATA
                );

                // Attempt to transfer earner with a non-authorized signer
                await expectAnchorError(
                    extEarn.methods
                        .transferEarner(earnManagerTwo.publicKey)
                        .accounts({ ...accounts })
                        .signers([nonAdmin])
                        .rpc(),
                    "NotAuthorized"
                );
            });

            // given the from earn manager does sign the transaction
            // given the from earn manager is not active
            // it reverts with a NotActive
            test("from earn manager is not active - reverts", async () => {
                const earnerOneATA = await getATA(extMint.publicKey, earnerOne.publicKey);

                // Remove the earn manager account (set it to inactive)
                await removeEarnManager(earnManagerOne.publicKey);

                // Setup the instruction
                prepTransferEarner(
                    earnManagerOne,
                    earnManagerOne.publicKey,
                    earnManagerTwo.publicKey,
                    earnerOneATA
                );

                // Attempt to transfer earner with an inactive earn manager account
                await expectAnchorError(
                    extEarn.methods
                        .transferEarner(earnManagerTwo.publicKey)
                        .accounts({ ...accounts })
                        .signers([earnManagerOne])
                        .rpc(),
                    "NotActive"
                );
            });

            // given the from earn manager signs the transaction
            // given the to earn manager is not active
            // it reverts with a NotActive error
            test("to earn manager is not active - reverts", async () => {
                const earnerOneATA = await getATA(extMint.publicKey, earnerOne.publicKey);

                // Remove the to earn manager account (set it to inactive)
                await removeEarnManager(earnManagerTwo.publicKey);

                // Setup the instruction
                prepTransferEarner(
                    earnManagerOne,
                    earnManagerOne.publicKey,
                    earnManagerTwo.publicKey,
                    earnerOneATA
                );

                // Attempt to transfer earner with an inactive to earn manager account
                await expectAnchorError(
                    extEarn.methods
                        .transferEarner(earnManagerTwo.publicKey)
                        .accounts({ ...accounts })
                        .signers([earnManagerOne])
                        .rpc(),
                    "NotActive"
                );
            });

            // given the from earn manager signs the transaction
            // given the accounts are correct and the earn managers are active
            // it updates the earner's earn manager to the "to earn manager"
            test("transfer_earner - success", async () => {
                const earnerOneATA = await getATA(extMint.publicKey, earnerOne.publicKey);



                // Setup the instruction
                const { earnerAccount } = prepTransferEarner(
                    earnManagerOne,
                    earnManagerOne.publicKey,
                    earnManagerTwo.publicKey,
                    earnerOneATA
                );

                // Confirm the earner's earn manager is currently earnManagerOne
                await expectEarnerState(
                    earnerAccount,
                    {
                        earnManager: earnManagerOne.publicKey
                    }
                );

                // Transfer the earner from earn manager one to earn manager two
                await extEarn.methods
                    .transferEarner(earnManagerTwo.publicKey)
                    .accounts({ ...accounts })
                    .signers([earnManagerOne])
                    .rpc();

                // Verify the earner account was updated
                await expectEarnerState(
                    earnerAccount,
                    {
                        earnManager: earnManagerTwo.publicKey
                    }
                );
            });
        });

        describe("configure_earn_manager unit tests", () => {
            // test cases
            // [X] given the earn manager account does not match the signer
            //   [X] it reverts with an address constraint error
            // [X] given the earn manager account matches the signer
            //   [X] given the fee basis points is greater than 100_00
            //     [X] it reverts with an InvalidParam error
            //   [X] given the fee basis points is less than or equal to 100_00
            //     [X] given the fee_token_account is for the wrong token mint
            //       [X] it reverts with an address constraint error
            //     [X] given the fee_token_account is for the correct token mint
            //       [X] given the earn manager account has not been initialized
            //         [ ] it reverts with an AccountNotInitialized error
            //       [X] given the earn manager account has been initialized
            //         [X] it updates the fee_bps to the provided value
            //         [X] it updates the fee_token_account to the provided token account
            // TODO add more test cases to handle null inputs (since fee and feeTokenAccount are optional)

            // given the earn manager account does not match the signer
            // it reverts with a seeds constraint error
            test("Earn manager account does not match signer - reverts", async () => {
                // Get the ATA for earn manager one
                const earnManagerOneATA = await getATA(
                    extMint.publicKey,
                    earnManagerOne.publicKey
                );

                // Setup the instruction
                await prepConfigureEarnManager(
                    nonEarnManagerOne,
                    earnManagerOne.publicKey,
                    earnManagerOneATA
                );

                // Attempt to configure earn manager with non-matching account
                await expectAnchorError(
                    extEarn.methods
                        .configureEarnManager(new BN(100))
                        .accounts({ ...accounts })
                        .signers([nonEarnManagerOne])
                        .rpc(),
                    "ConstraintSeeds"
                );
            });


            // given the earn manager account matches the signer
            // given the fee basis points is greater than 100_00
            // it reverts with an InvalidParam error
            test("Fee basis points > 10000 - reverts", async () => {

                // Get the ATA for earn manager one
                const earnManagerOneATA = await getATA(
                    extMint.publicKey,
                    earnManagerOne.publicKey
                );

                // Setup the instruction
                await prepConfigureEarnManager(
                    earnManagerOne,
                    earnManagerOne.publicKey,
                    earnManagerOneATA
                );

                const feeBps = new BN(randomInt(10001, 2 ** 48 - 1));

                // Attempt to configure earn manager with invalid fee basis points
                await expectAnchorError(
                    extEarn.methods
                        .configureEarnManager(feeBps)
                        .accounts({ ...accounts })
                        .signers([earnManagerOne])
                        .rpc(),
                    "InvalidParam"
                );
            });

            // given the earn manager account matches the signer
            // given the provided merkle proof for the signer is valid
            // given the fee basis points is less than or equal to 100_00
            // given the fee_token_account is for the wrong token mint
            // it reverts with a constraint token mint error
            test("Fee token account for wrong mint - reverts", async () => {
                // Create a new token mint
                const wrongMint = new Keypair();
                await createMint(wrongMint, nonAdmin.publicKey);

                // Get the ATA for earn manager one with the wrong mint
                const wrongATA = await getATA(
                    wrongMint.publicKey,
                    earnManagerOne.publicKey
                );

                // Setup the instruction
                await prepConfigureEarnManager(
                    earnManagerOne,
                    earnManagerOne.publicKey,
                    wrongATA
                );

                // Attempt to configure earn manager with invalid fee token account
                await expectAnchorError(
                    extEarn.methods
                        .configureEarnManager(new BN(100))
                        .accounts({ ...accounts })
                        .signers([earnManagerOne])
                        .rpc(),
                    "ConstraintTokenMint"
                );
            });

            // given the earn manager account matches the signer
            // given the fee basis points is less than or equal to 100_00
            // given the fee_token_account is for the correct token mint and the authority is the signer
            // given the earn manager account already exists
            // it updates the fee_bps to the provided value
            // it updates the fee_token_account to the provided token account
            test("Configure earn manager - success", async () => {

                // Get the ATA for earn manager one
                const earnManagerOneATA = await getATA(
                    extMint.publicKey,
                    earnManagerOne.publicKey
                );

                // Use the ATA for a different address to change the fee token account to
                // it's easier than creating a manual token account
                const newFeeTokenAccount = await getATA(
                    extMint.publicKey,
                    nonEarnManagerOne.publicKey
                );

                // Setup the instruction
                const { earnManagerAccount } = await prepConfigureEarnManager(
                    earnManagerOne,
                    earnManagerOne.publicKey,
                    newFeeTokenAccount
                );

                // Confirm the earn manager account has already been created
                await expectEarnManagerState(earnManagerAccount, {
                    isActive: true,
                    feeBps: new BN(0),
                    feeTokenAccount: earnManagerOneATA,
                });

                const newFee = new BN(100);

                // Send the instruction
                try {
                    await extEarn.methods
                        .configureEarnManager(newFee)
                        .accounts({ ...accounts })
                        .signers([earnManagerOne])
                        .rpc();
                } catch (e) {
                    console.log(e);
                }

                // Verify the earn manager account is created and updated
                await expectEarnManagerState(earnManagerAccount, {
                    isActive: true,
                    feeBps: newFee,
                    feeTokenAccount: newFeeTokenAccount,
                });
            });
        });

    });

    describe("earner instruction tests", () => {
        // beforeEach(async () => {
        //     // Initialize the program
        //     await initializeExt(earnAuthority.publicKey);

        //     // Add an earn manager
        //     await addEarnManager(earnManagerOne.publicKey, new BN(0));

        //     // Add an earner under the earn manager
        //     await addEarner(earnManagerOne, earnerOne.publicKey);
        // });

        describe("set_recipient unit tests", () => {
            // test cases
            // [ ] given the recipient token account is None
            //   [ ] given the earner signs the transaction
            //     [ ] it updates the earner's recipient token account to None (defaults to user token account)
            //   [ ] given the earn manager signs the transaction
            //     [ ] it updates the earner's recipient token account to None (defaults to user token account)
            //   [ ] given any other account signs the transaction
            //     [ ] it reverts with a NotAuthorized error
            // [ ] given a recipient token account is provided
            //   [ ] given the recipient token account is for the wrong mint
            //     [ ] it reverts with a TokenMint error
            //   [ ] given the recipient token account does not have an immutable owner
            //     [ ] it reverts with a MutableOwner error
            //   [ ] given the recipient token account is valid
            //     [ ] given the earner signs the transaction
            //       [ ] it updates the earner's recipient token account to the provided value
            //     [ ] given the earn manager signs the transaction
            //       [ ] it updates the earner's recipient token account to the provided value
            //     [ ] given any other account signs the transaction
            //       [ ] it reverts with a NotAuthorized error


        });
    });

});





// describe("claim_for unit tests", () => {
//     // test cases
//     // [X] given the earn authority does not sign the transaction
//     //   [X] it reverts with an address constraint error
//     // [X] given the earn authority signs the transaction
//     //   [X] given the user token account's earner account is not initialized
//     //     [X] it reverts with an account not initialized error
//     //   [X] given the earner's last claim index is the current index
//     //     [X] it reverts with an AlreadyClaimed error
//     //   [X] given the amonut to be minted causes the total distributed to exceed the max yield
//     //     [X] it reverts with am ExceedsMaxYield error
//     //   [X] given the earner doesn't have an earn manager
//     //     [X] the correct amount is minted to the earner's token account
//     //   [X] given the earner does have an earn manager
//     //     [X] given no earn manager account is provided
//     //       [X] it reverts with a RequiredAccountMissing error
//     //     [X] given no earn manager token account is provided
//     //       [X] it reverts with a RequiredAccountMissing error
//     //     [X] given an earn manager token account is provided, but it doesn't match the fee recipient token account in the earn manager's configuration
//     //       [X] it reverts with an InvalidAccount error
//     //     [X] given the earn manager account and earn manager token account are provided correctly
//     //       [X] when the fee percent is zero
//     //         [X] the full amount is minted to the earner
//     //       [X] when the fee percent is not zero, but the actual fee rounds to zero
//     //         [X] the full amount is minted to the earner
//     //       [X] when the fee is non-zero
//     //         [X] given the earn manager account is active
//     //            [X] the fee amount is minted to the earn manager token account
//     //            [X] the total rewards minus the fee is minted to the earner token account
//     //         [X] given the earn manager account is not active
//     //           [X] the full amount is minted to the earner

//     beforeEach(async () => {
//         // Initialize the program
//         await initialize(
//             mint.publicKey,
//             earnAuthority.publicKey,
//             initialIndex,
//             claimCooldown
//         );

//         // Populate the earner merkle tree with the initial earners
//         earnerMerkleTree = new MerkleTree([
//             admin.publicKey,
//             earnerOne.publicKey,
//             earnerTwo.publicKey,
//         ]);

//         // Populate the earn manager merkle tree with the initial earn managers
//         earnManagerMerkleTree = new MerkleTree([
//             earnManagerOne.publicKey,
//             earnManagerTwo.publicKey,
//         ]);

//         // Warp past the initial cooldown period
//         warp(claimCooldown, true);

//         // Propagate the earner and earn manager merkle roots so we can add earners
//         await propagateIndex(
//             initialIndex,
//             earnerMerkleTree.getRoot(),
//             earnManagerMerkleTree.getRoot()
//         );

//         // Add earner one as a registrar earner
//         const { proof: earnerOneProof } = earnerMerkleTree.getInclusionProof(
//             earnerOne.publicKey
//         );
//         await addRegistrarEarner(earnerOne.publicKey, earnerOneProof);

//         // Add earn manager one as an earn manager and configure a 100 bps fee
//         const { proof: earnManagerOneProof } =
//             earnManagerMerkleTree.getInclusionProof(earnManagerOne.publicKey);
//         await configureEarnManager(
//             earnManagerOne,
//             new BN(100),
//             earnManagerOneProof
//         );

//         // Add non earner one as an earner under earn manager one
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             nonEarnerOne.publicKey
//         );
//         await addEarner(
//             earnManagerOne,
//             nonEarnerOne.publicKey,
//             proofs,
//             neighbors
//         );

//         // Send earner one 10 tokens so they have a positive balance
//         await mintM(earnerOne.publicKey, new BN(10_000_000));

//         // Send non earner one 10 tokens so they have a positive balance
//         await mintM(nonEarnerOne.publicKey, new BN(10_000_000));
//     });

//     // given the earn authority doesn't sign the transaction
//     // it reverts with an address constraint error
//     test("Non-earn authority cannot claim - reverts", async () => {
//         // Setup the instruction
//         await prepClaimFor(nonAdmin, mint.publicKey, earnerOne.publicKey);

//         // Attempt to claim with non-earn authority
//         await expectAnchorError(
//             earn.methods
//                 .claimFor(new BN(100_000_000))
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "NotAuthorized"
//         );
//     });

//     // given the earn authority signs the transaction
//     // given the user token account's earner account is not initialized
//     // it reverts with an account not initialized error
//     test("Earner account not initialized - reverts", async () => {
//         // Setup the instruction
//         await prepClaimFor(earnAuthority, mint.publicKey, earnerTwo.publicKey);

//         // Attempt to claim for non-initialized earner
//         await expectAnchorError(
//             earn.methods
//                 .claimFor(new BN(10_000_000))
//                 .accounts({ ...accounts })
//                 .signers([earnAuthority])
//                 .rpc(),
//             "AccountNotInitialized"
//         );
//     });

//     // given the earn authority signs the transaction
//     // given the earner's last claim index is the current index
//     // it reverts with an AlreadyClaimed error
//     test("Earner already claimed - reverts", async () => {
//         // Setup the instruction
//         await prepClaimFor(earnAuthority, mint.publicKey, earnerOne.publicKey);

//         // Attempt to claim, but the earner is already up to date
//         await expectAnchorError(
//             earn.methods
//                 .claimFor(new BN(10_000_000))
//                 .accounts({ ...accounts })
//                 .signers([earnAuthority])
//                 .rpc(),
//             "AlreadyClaimed"
//         );
//     });

//     // given the earn authority signs the transaction
//     // given the amount to be minted causes the total distributed to exceed the max yield
//     // it reverts with an ExceedsMaxYield error
//     test("Exceeds max yield - reverts", async () => {
//         // Update the index so there is outstanding yield
//         await propagateIndex(new BN(1_100_000_000_000));

//         // Setup the instruction
//         await prepClaimFor(earnAuthority, mint.publicKey, earnerOne.publicKey);

//         // Attempt to claim an amount that exceeds the max yield
//         await expectAnchorError(
//             earn.methods
//                 .claimFor(new BN(120_000_001))
//                 .accounts({ ...accounts })
//                 .signers([earnAuthority])
//                 .rpc(),
//             "ExceedsMaxYield"
//         );
//     });

//     // given the earn authority signs the transaction
//     // given the earner doesn't have an earn manager
//     // the correct amount is minted to the earner's token account
//     test("Earner has no earn manager - success", async () => {
//         // Update the index so there is outstanding yield
//         await propagateIndex(new BN(1_100_000_000_000));

//         // Setup the instruction
//         const { earnerAccount, earnerATA } = await prepClaimFor(
//             earnAuthority,
//             mint.publicKey,
//             earnerOne.publicKey
//         );

//         // Verify the starting values
//         await expectTokenBalance(earnerATA, new BN(10_000_000));
//         expectEarnerState(earnerAccount, {
//             lastClaimIndex: initialIndex,
//         });

//         // Claim for the earner
//         await earn.methods
//             .claimFor(new BN(10_000_000))
//             .accounts({ ...accounts })
//             .signers([earnAuthority])
//             .rpc();

//         const currentTime = new BN(svm.getClock().unixTimestamp.toString());

//         // Verify the user token account was minted the correct amount
//         // and the last claim index was updated
//         await expectTokenBalance(earnerATA, new BN(11_000_000));
//         expectEarnerState(earnerAccount, {
//             lastClaimIndex: new BN(1_100_000_000_000),
//             lastClaimTimestamp: currentTime,
//         });
//     });

//     // given the earn authority signs the transaction
//     // given the earner does have an earn manager
//     // given no earn manager account is provided
//     // it reverts with a RequiredAccountMissing error
//     test("No earn manager account provided - reverts", async () => {
//         // Update the index so there is outstanding yield
//         await propagateIndex(new BN(1_100_000_000_000));

//         // Setup the instruction
//         await prepClaimFor(earnAuthority, mint.publicKey, nonEarnerOne.publicKey);

//         // Attempt to claim without an earn manager account
//         await expectAnchorError(
//             earn.methods
//                 .claimFor(new BN(10_000_000))
//                 .accounts({ ...accounts })
//                 .signers([earnAuthority])
//                 .rpc(),
//             "RequiredAccountMissing"
//         );
//     });

//     // given the earn authority signs the transaction
//     // given the earner does have an earn manager
//     // given no earn manager token account is provided
//     // it reverts with a RequiredAccountMissing error
//     test("No earn manager token account provided - reverts", async () => {
//         // Update the index so there is outstanding yield
//         await propagateIndex(new BN(1_100_000_000_000));

//         // Setup the instruction
//         await prepClaimFor(
//             earnAuthority,
//             mint.publicKey,
//             nonEarnerOne.publicKey,
//             earnManagerOne.publicKey
//         );

//         // Manually remove the earn manager token account
//         accounts.earnManagerTokenAccount = null;

//         // Attempt to claim without an earn manager token account
//         await expectAnchorError(
//             earn.methods
//                 .claimFor(new BN(10_000_000))
//                 .accounts({ ...accounts })
//                 .signers([earnAuthority])
//                 .rpc(),
//             "RequiredAccountMissing"
//         );
//     });

//     // given the earn authority signs the transaction
//     // given an earn manager token account is provided, but it doesn't match the fee recipient token account in the earn manager's configuration
//     // it reverts with an InvalidAccount error
//     test("Invalid earn manager token account - reverts", async () => {
//         // Update the index so there is outstanding yield
//         await propagateIndex(new BN(1_100_000_000_000));

//         // Setup the instruction
//         await prepClaimFor(
//             earnAuthority,
//             mint.publicKey,
//             nonEarnerOne.publicKey,
//             earnManagerOne.publicKey
//         );

//         // Manually change the earn manager token account
//         const { tokenAccount: newEarnManagerTokenAccount } =
//             await createTokenAccount(mint.publicKey, earnManagerOne.publicKey);
//         accounts.earnManagerTokenAccount = newEarnManagerTokenAccount;

//         // Attempt to claim with an invalid earn manager token account
//         await expectAnchorError(
//             earn.methods
//                 .claimFor(new BN(10_000_000))
//                 .accounts({ ...accounts })
//                 .signers([earnAuthority])
//                 .rpc(),
//             "InvalidAccount"
//         );
//     });

//     // given the earn authority signs the transaction
//     // given the earn manager account and earn manager token account are provided correctly
//     // when the fee percent is zero
//     // the full amount is minted to the earner
//     test("Claim with fee percent zero - success", async () => {
//         // Change the earn manager's fee percent to zero
//         const { proof } = earnManagerMerkleTree.getInclusionProof(
//             earnManagerOne.publicKey
//         );
//         await configureEarnManager(earnManagerOne, new BN(0), proof);

//         // Update the index so there is outstanding yield
//         await propagateIndex(new BN(1_100_000_000_000));

//         // Setup the instruction
//         const { earnerAccount, earnerATA } = await prepClaimFor(
//             earnAuthority,
//             mint.publicKey,
//             nonEarnerOne.publicKey,
//             earnManagerOne.publicKey
//         );
//         const earnManagerATA = await getATA(
//             mint.publicKey,
//             earnManagerOne.publicKey
//         );

//         // console.log("accounts", accounts);

//         // Verify the starting values
//         await expectTokenBalance(earnerATA, new BN(10_000_000));
//         await expectTokenBalance(earnManagerATA, new BN(0));
//         expectEarnerState(earnerAccount, {
//             lastClaimIndex: initialIndex,
//         });

//         // Claim for the earner
//         await earn.methods
//             .claimFor(new BN(10_000_000))
//             .accounts({ ...accounts })
//             .signers([earnAuthority])
//             .rpc();

//         const currentTime = new BN(svm.getClock().unixTimestamp.toString());

//         // Verify the user token account was minted the correct amount
//         // and the last claim index was updated
//         await expectTokenBalance(earnerATA, new BN(11_000_000));
//         await expectTokenBalance(earnManagerATA, new BN(0));
//         expectEarnerState(earnerAccount, {
//             lastClaimIndex: new BN(1_100_000_000_000),
//             lastClaimTimestamp: currentTime,
//         });
//     });

//     // given the earn authority signs the transaction
//     // given the earn manager account and earn manager token account are provided correctly
//     // when the fee percent is not zero, but the actual fee rounds to zero
//     // the full amount is minted to the earner
//     test("Claim with fee that rounds to zero - success", async () => {
//         // Change the earn manager's fee percent to 1
//         const { proof } = earnManagerMerkleTree.getInclusionProof(
//             earnManagerOne.publicKey
//         );
//         await configureEarnManager(earnManagerOne, new BN(1), proof);

//         // Update the index so there a tiny amount of outstanding yield
//         await propagateIndex(new BN(1_000_001_000_000));

//         // Setup the instruction
//         const { earnerAccount, earnerATA } = await prepClaimFor(
//             earnAuthority,
//             mint.publicKey,
//             nonEarnerOne.publicKey,
//             earnManagerOne.publicKey
//         );
//         const earnManagerATA = await getATA(
//             mint.publicKey,
//             earnManagerOne.publicKey
//         );

//         // Verify the starting values
//         await expectTokenBalance(earnerATA, new BN(10_000_000));
//         await expectTokenBalance(earnManagerATA, new BN(0));
//         expectEarnerState(earnerAccount, {
//             lastClaimIndex: initialIndex,
//         });

//         // Claim for the earner
//         await earn.methods
//             .claimFor(new BN(10_000_000))
//             .accounts({ ...accounts })
//             .signers([earnAuthority])
//             .rpc();

//         const currentTime = new BN(svm.getClock().unixTimestamp.toString());

//         // Verify the user token account was minted the correct amount
//         // and the last claim index was updated
//         await expectTokenBalance(earnerATA, new BN(10_000_010));
//         await expectTokenBalance(earnManagerATA, new BN(0));
//         expectEarnerState(earnerAccount, {
//             lastClaimIndex: new BN(1_000_001_000_000),
//             lastClaimTimestamp: currentTime,
//         });
//     });

//     // given the earn authority signs the transaction
//     // given the earn manager account and earn manager token account are provided correctly
//     // when the fee is non-zero
//     // given the earn manager account is active
//     // the fee amount is minted to the earn manager token account
//     // the total rewards minus the fee is minted to the earner token account
//     test("Claim with non-zero fee and earn manager active - success", async () => {
//         // Update the index so there is outstanding yield
//         await propagateIndex(new BN(1_100_000_000_000));

//         // Setup the instruction
//         const { earnerAccount, earnerATA } = await prepClaimFor(
//             earnAuthority,
//             mint.publicKey,
//             nonEarnerOne.publicKey,
//             earnManagerOne.publicKey
//         );
//         const earnManagerATA = await getATA(
//             mint.publicKey,
//             earnManagerOne.publicKey
//         );

//         // Verify the starting values
//         await expectTokenBalance(earnerATA, new BN(10_000_000));
//         await expectTokenBalance(earnManagerATA, new BN(0));
//         expectEarnerState(earnerAccount, {
//             lastClaimIndex: initialIndex,
//         });

//         // Claim for the earner
//         await earn.methods
//             .claimFor(new BN(10_000_000))
//             .accounts({ ...accounts })
//             .signers([earnAuthority])
//             .rpc();

//         const currentTime = new BN(svm.getClock().unixTimestamp.toString());

//         // Verify the user token account was minted the correct amount
//         // and the last claim index was updated
//         await expectTokenBalance(earnerATA, new BN(10_990_000));
//         await expectTokenBalance(earnManagerATA, new BN(10_000));
//         expectEarnerState(earnerAccount, {
//             lastClaimIndex: new BN(1_100_000_000_000),
//             lastClaimTimestamp: currentTime,
//         });
//     });

//     // given the earn authority signs the transaction
//     // given the earn manager account and earn manager token account are provided correctly
//     // when the fee is non-zero
//     // given the earn manager account is not active
//     // the full amount is minted to the earner
//     test("Claim with non-zero fee and earn manager inactive - success", async () => {
//         // Remove the earn manager from the earn manager merkle tree
//         earnManagerMerkleTree.removeLeaf(earnManagerOne.publicKey);

//         // Update the index so there is outstanding yield and update the earn manager merkle root
//         await propagateIndex(
//             new BN(1_100_000_000_000),
//             ZERO_WORD,
//             earnManagerMerkleTree.getRoot()
//         );

//         // Get the exclusion proof for the earn manager and set their account to inactive
//         const { proofs, neighbors } = earnManagerMerkleTree.getExclusionProof(
//             earnManagerOne.publicKey
//         );
//         await removeEarnManager(earnManagerOne.publicKey, proofs, neighbors);

//         // Setup the instruction
//         const { earnerAccount, earnerATA } = await prepClaimFor(
//             earnAuthority,
//             mint.publicKey,
//             nonEarnerOne.publicKey,
//             earnManagerOne.publicKey
//         );
//         const earnManagerATA = await getATA(
//             mint.publicKey,
//             earnManagerOne.publicKey
//         );

//         // Verify the starting values
//         await expectTokenBalance(earnerATA, new BN(10_000_000));
//         await expectTokenBalance(earnManagerATA, new BN(0));
//         expectEarnerState(earnerAccount, {
//             lastClaimIndex: initialIndex,
//         });

//         // Claim for the earner
//         await earn.methods
//             .claimFor(new BN(10_000_000))
//             .accounts({ ...accounts })
//             .signers([earnAuthority])
//             .rpc();

//         const currentTime = new BN(svm.getClock().unixTimestamp.toString());

//         // Verify the user token account was minted the correct amount
//         // and the last claim index was updated
//         await expectTokenBalance(earnerATA, new BN(11_000_000));
//         await expectTokenBalance(earnManagerATA, new BN(0));
//         expectEarnerState(earnerAccount, {
//             lastClaimIndex: new BN(1_100_000_000_000),
//             lastClaimTimestamp: currentTime,
//         });
//     });
// });

// describe("complete_claims unit tests", () => {
//     // test cases
//     // [X] given the earn authority does not sign the transaction
//     //   [X] it reverts with an address constraint error
//     // [X] given the earn authority signs the transaction
//     //   [X] given the most recent claim is complete
//     //     [X] it reverts with a NoActiveClaim error
//     //   [X] given the most recent claim is not complete
//     //     [X] it sets the claim complete flag to true in the global account

//     beforeEach(async () => {
//         // Initialize the program
//         await initialize(
//             mint.publicKey,
//             earnAuthority.publicKey,
//             initialIndex,
//             claimCooldown
//         );

//         // Warp past the initial cooldown period
//         warp(claimCooldown, true);

//         // Propagate a new index to start a new claim cycle
//         await propagateIndex(new BN(1_100_000_000_000));
//     });

//     // given the earn authority does not sign the transaction
//     // it reverts with an address constraint error
//     test("Earn authority does not sign - reverts", async () => {
//         // Setup the instruction
//         prepCompleteClaims(nonAdmin);

//         // Attempt to complete claim with non-earn authority
//         await expectAnchorError(
//             earn.methods
//                 .completeClaims()
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "NotAuthorized"
//         );
//     });

//     // given the earn authority signs the transaction
//     // given the most recent claim is complete
//     // it reverts with a NoActiveClaim error
//     test("Claim already complete - reverts", async () => {
//         // Complete the active claim
//         await completeClaims();

//         // Expire the blockhash so the same txn can be sent again (in a new block)
//         svm.expireBlockhash();

//         // Setup the instruction
//         prepCompleteClaims(earnAuthority);

//         // Attempt to complete claim when already complete
//         await expectAnchorError(
//             earn.methods
//                 .completeClaims()
//                 .accounts({ ...accounts })
//                 .signers([earnAuthority])
//                 .rpc(),
//             "NoActiveClaim"
//         );
//     });

//     // given the earn authority signs the transaction
//     // given the most recent claim is not complete
//     // it sets the claim complete flag to true in the global account
//     test("Complete claims - success", async () => {
//         // Setup the instruction
//         const { globalAccount } = prepCompleteClaims(earnAuthority);

//         // Complete the claim
//         await earn.methods
//             .completeClaims()
//             .accounts({ ...accounts })
//             .signers([earnAuthority])
//             .rpc();

//         // Verify the global state was updated
//         await expectGlobalState(globalAccount, {
//             claimComplete: true,
//         });
//     });
// });

// describe("configure earn_manager unit tests", () => {
//     // test cases
//     // [X] given the earn manager account does not match the signer
//     //   [X] it reverts with an address constraint error
//     // [X] given the earn manager account matches the signer
//     //   [X] given the provided merkle proof for the signer is invalid
//     //     [X] it reverts with a InvalidProof error
//     //   [X] given the provided merkle proof for the signer is valid
//     //     [X] given the fee basis points is greater than 100_00
//     //       [X] it reverts with an InvalidParam error
//     //     [X] given the fee basis points is less than or equal to 100_00
//     //       [X] given the fee_token_account is for the wrong token mint
//     //         [X] it reverts with an address constraint error
//     //       [X] given the fee_token_account is for the correct token mint
//     //         [X] given the earn manager account does not exist yet
//     //           [X] it creates the earn manager account and the signer pays for it
//     //           [X] it sets the earn manager is_active flag to true
//     //           [X] it sets the fee_bps to the provided value
//     //           [X] it sets the fee_token_account to the provided token account
//     //         [X] given the earn manager account already exists
//     //           [X] it updates the fee_bps to the provided value
//     //           [X] it updates the fee_token_account to the provided token account

//     beforeEach(async () => {
//         // Initialize the program
//         await initialize(
//             mint.publicKey,
//             earnAuthority.publicKey,
//             initialIndex,
//             claimCooldown
//         );

//         // Populate the earner merkle tree with the initial earners
//         earnerMerkleTree = new MerkleTree([
//             admin.publicKey,
//             earnerOne.publicKey,
//             earnerTwo.publicKey,
//         ]);

//         // Populate the earn manager merkle tree with the initial earn managers
//         earnManagerMerkleTree = new MerkleTree([
//             earnManagerOne.publicKey,
//             earnManagerTwo.publicKey,
//         ]);

//         // Warp time forward past the initial cooldown period
//         warp(claimCooldown, true);

//         // Propagate a new index to start a new claim cycle and set the merkle roots
//         await propagateIndex(
//             new BN(1_100_000_000_000),
//             earnerMerkleTree.getRoot(),
//             earnManagerMerkleTree.getRoot()
//         );
//     });

//     // given the earn manager account does not match the signer
//     // it reverts with a seeds constraint error
//     test("Earn manager account does not match signer - reverts", async () => {
//         // Get the ATA for earn manager one
//         const earnManagerOneATA = await getATA(
//             mint.publicKey,
//             earnManagerOne.publicKey
//         );

//         // Get the inclusion proof for earn manager one in the earn manager tree
//         const { proof } = earnManagerMerkleTree.getInclusionProof(
//             earnManagerOne.publicKey
//         );

//         // Setup the instruction
//         prepConfigureEarnManager(
//             earnManagerOne,
//             nonEarnManagerOne.publicKey,
//             earnManagerOneATA
//         );

//         // Attempt to configure earn manager with non-matching account
//         await expectAnchorError(
//             earn.methods
//                 .configureEarnManager(new BN(100), proof)
//                 .accounts({ ...accounts })
//                 .signers([earnManagerOne])
//                 .rpc(),
//             "ConstraintSeeds"
//         );
//     });

//     // given the earn manager account matches the signer
//     // given the provided merkle proof for the signer is invalid
//     // it reverts with an InvalidProof error
//     test("Invalid merkle proof - reverts", async () => {
//         // Get the inclusion proof for earn manager one in the earn manager tree
//         const { proof } = earnManagerMerkleTree.getInclusionProof(
//             earnManagerOne.publicKey
//         );

//         // Get the ATA for non earn manager one
//         const nonEarnManagerOneATA = await getATA(
//             mint.publicKey,
//             nonEarnManagerOne.publicKey
//         );

//         // Setup the instruction
//         prepConfigureEarnManager(
//             nonEarnManagerOne,
//             nonEarnManagerOne.publicKey,
//             nonEarnManagerOneATA
//         );

//         // Attempt to configure earn manager with invalid merkle proof
//         await expectAnchorError(
//             earn.methods
//                 .configureEarnManager(new BN(100), proof)
//                 .accounts({ ...accounts })
//                 .signers([nonEarnManagerOne])
//                 .rpc(),
//             "InvalidProof"
//         );
//     });

//     // given the earn manager account matches the signer
//     // given the provided merkle proof for the signer is valid
//     // given the fee basis points is greater than 100_00
//     // it reverts with an InvalidParam error
//     test("Fee basis points > 10000 - reverts", async () => {
//         // Get the inclusion proof for earn manager one in the earn manager tree
//         const { proof } = earnManagerMerkleTree.getInclusionProof(
//             earnManagerOne.publicKey
//         );

//         // Get the ATA for earn manager one
//         const earnManagerOneATA = await getATA(
//             mint.publicKey,
//             earnManagerOne.publicKey
//         );

//         // Setup the instruction
//         prepConfigureEarnManager(
//             earnManagerOne,
//             earnManagerOne.publicKey,
//             earnManagerOneATA
//         );

//         // Attempt to configure earn manager with invalid fee basis points
//         await expectAnchorError(
//             earn.methods
//                 .configureEarnManager(new BN(100_01), proof)
//                 .accounts({ ...accounts })
//                 .signers([earnManagerOne])
//                 .rpc(),
//             "InvalidParam"
//         );
//     });

//     // given the earn manager account matches the signer
//     // given the provided merkle proof for the signer is valid
//     // given the fee basis points is less than or equal to 100_00
//     // given the fee_token_account is for the wrong token mint
//     // it reverts with a constraint token mint error
//     test("Fee token account for wrong mint - reverts", async () => {
//         // Create a new token mint
//         const wrongMint = new Keypair();
//         await createMint(wrongMint, nonAdmin);

//         // Get the ATA for earn manager one with the wrong mint
//         const wrongATA = await getATA(
//             wrongMint.publicKey,
//             earnManagerOne.publicKey
//         );

//         // Get the inclusion proof for earn manager one in the earn manager tree
//         const { proof } = earnManagerMerkleTree.getInclusionProof(
//             earnManagerOne.publicKey
//         );

//         // Setup the instruction
//         prepConfigureEarnManager(
//             earnManagerOne,
//             earnManagerOne.publicKey,
//             wrongATA
//         );

//         // Attempt to configure earn manager with invalid fee token account
//         await expectAnchorError(
//             earn.methods
//                 .configureEarnManager(new BN(100), proof)
//                 .accounts({ ...accounts })
//                 .signers([earnManagerOne])
//                 .rpc(),
//             "ConstraintTokenMint"
//         );
//     });

//     // given the earn manager account matches the signer
//     // given the provided merkle proof for the signer is valid
//     // given the fee basis points is less than or equal to 100_00
//     // given the fee_token_account is for the correct token mint and the authority is the signer
//     // given the earn manager account does not exist yet
//     // it creates the earn manager account and the signer pays for it
//     // it sets the earn manager is_active flag to true
//     // it sets the fee_bps to the provided value
//     // it sets the fee_token_account to the provided token account
//     test("Earn manager account does not exist - success", async () => {
//         // Get the ATA for earn manager one
//         const earnManagerOneATA = await getATA(
//             mint.publicKey,
//             earnManagerOne.publicKey
//         );

//         // Get the inclusion proof for earn manager one in the earn manager tree
//         const { proof } = earnManagerMerkleTree.getInclusionProof(
//             earnManagerOne.publicKey
//         );

//         // Setup the instruction
//         const { earnManagerAccount } = prepConfigureEarnManager(
//             earnManagerOne,
//             earnManagerOne.publicKey,
//             earnManagerOneATA
//         );

//         // Confirm the earn manager account is currently empty
//         expectAccountEmpty(earnManagerAccount);

//         // Send the instruction
//         await earn.methods
//             .configureEarnManager(new BN(100), proof)
//             .accounts({ ...accounts })
//             .signers([earnManagerOne])
//             .rpc();

//         // Verify the earn manager account is created and updated
//         await expectEarnManagerState(earnManagerAccount, {
//             isActive: true,
//             feeBps: new BN(100),
//             feeTokenAccount: earnManagerOneATA,
//         });
//     });

//     // given the earn manager account matches the signer
//     // given the provided merkle proof for the signer is valid
//     // given the fee basis points is less than or equal to 100_00
//     // given the fee_token_account is for the correct token mint and the authority is the signer
//     // given the earn manager account already exists
//     // it updates the fee_bps to the provided value
//     // it updates the fee_token_account to the provided token account
//     test("Earn manager account exists - success", async () => {
//         // Get the inclusion proof for earn manager one in the earn manager tree
//         const { proof } = earnManagerMerkleTree.getInclusionProof(
//             earnManagerOne.publicKey
//         );

//         // Setup the earn manager account the first time
//         await configureEarnManager(earnManagerOne, new BN(100), proof);

//         // Expire the blockhash so the same txn can be sent again (in a new block)
//         svm.expireBlockhash();

//         // Get the ATA for earn manager one
//         const earnManagerOneATA = await getATA(
//             mint.publicKey,
//             earnManagerOne.publicKey
//         );

//         // Setup the instruction
//         const { earnManagerAccount } = prepConfigureEarnManager(
//             earnManagerOne,
//             earnManagerOne.publicKey,
//             earnManagerOneATA
//         );

//         // Confirm the earn manager account has already been created
//         await expectEarnManagerState(earnManagerAccount, {
//             isActive: true,
//             feeBps: new BN(100),
//             feeTokenAccount: earnManagerOneATA,
//         });

//         // Send the instruction
//         await earn.methods
//             .configureEarnManager(new BN(101), proof)
//             .accounts({ ...accounts })
//             .signers([earnManagerOne])
//             .rpc();

//         // Verify the earn manager account is created and updated
//         await expectEarnManagerState(earnManagerAccount, {
//             isActive: true,
//             feeBps: new BN(101),
//             feeTokenAccount: earnManagerOneATA, // TODO create another token account for the earn manager to test this
//         });
//     });
// });

// describe("add_earner unit tests", () => {
//     // test cases
//     // [X] given signer does not have an earn manager account initialized
//     //   [X] it reverts with an account not initialized error
//     // [X] given signer has an earn manager account initialized
//     //   [X] given earn manager account is not active
//     //     [X] it reverts with a NotAuthorized error
//     //   [X] given earn manager account is active
//     //     [X] given the earner already has an earner account
//     //       [X] it reverts with an account already initialized error
//     //     [X] given the earner does not already have an earner account
//     //       [X] given merkle proof for user exclusion from earner list is invalid
//     //         [X] it reverts with an InvalidProof error
//     //       [X] given merkle proof for user exclusion from earner list is valid
//     //         [X] given user token account is for the wrong token mint
//     //           [X] it reverts with an address constraint error
//     //         [X] given user token account authority does not match the user pubkey
//     //           [X] it reverts with an address constraint error
//     //         [X] given the user token account is for the correct token mint and the authority is the user pubkey
//     //           [X] it creates the earner account
//     //           [X] it sets the user to the provided pubkey
//     //           [X] it sets the user_token_account to the provided token account
//     //           [X] it sets the earner is_active flag to true
//     //           [X] it sets the earn_manager to the provided earn manager pubkey
//     //           [X] it sets the last_claim_index to the current index

//     beforeEach(async () => {
//         // Initialize the program
//         await initialize(
//             mint.publicKey,
//             earnAuthority.publicKey,
//             initialIndex,
//             claimCooldown
//         );

//         // Populate the earner merkle tree with the initial earners
//         earnerMerkleTree = new MerkleTree([
//             admin.publicKey,
//             earnerOne.publicKey,
//             earnerTwo.publicKey,
//         ]);

//         // Populate the earn manager merkle tree with the initial earn managers
//         earnManagerMerkleTree = new MerkleTree([
//             earnManagerOne.publicKey,
//             earnManagerTwo.publicKey,
//         ]);

//         // Warp time forward past the initial cooldown period
//         warp(claimCooldown, true);

//         // Propagate a new index to start a new claim cycle and set the merkle roots
//         await propagateIndex(
//             new BN(1_100_000_000_000),
//             earnerMerkleTree.getRoot(),
//             earnManagerMerkleTree.getRoot()
//         );

//         // Get inclusion proof for earn manager one in the earn manager tree
//         const { proof: earnManagerOneProof } =
//             earnManagerMerkleTree.getInclusionProof(earnManagerOne.publicKey);

//         // Initialize earn manager one's account
//         await configureEarnManager(
//             earnManagerOne,
//             new BN(100),
//             earnManagerOneProof
//         );
//     });

//     // given signer does not have an earn manager account initialized
//     // it reverts with an account not initialized error
//     test("Signer earn manager account not initialized - reverts", async () => {
//         // Get the ATA for non earner one
//         const nonEarnerOneATA = await getATA(
//             mint.publicKey,
//             nonEarnerOne.publicKey
//         );

//         // Setup the instruction
//         prepAddEarner(
//             nonEarnManagerOne,
//             nonEarnManagerOne.publicKey,
//             nonEarnerOneATA
//         );

//         // Get the exclusion proof for the earner against the earner merkle tree
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             nonEarnerOne.publicKey
//         );

//         // Attempt to add earner without an initialized earn manager account
//         await expectAnchorError(
//             earn.methods
//                 .addEarner(nonEarnerOne.publicKey, proofs, neighbors)
//                 .accounts({ ...accounts })
//                 .signers([nonEarnManagerOne])
//                 .rpc(),
//             "AccountNotInitialized"
//         );
//     });

//     // given signer has an earn manager account initialized
//     // given earn manager account is not active
//     // it reverts with a NotActive error
//     test("Signer's earn manager account not active - reverts", async () => {
//         // Get the ATA for non earner one
//         const nonEarnerOneATA = await getATA(
//             mint.publicKey,
//             nonEarnerOne.publicKey
//         );

//         // Remove earn manager one from the earn manager merkle tree
//         earnManagerMerkleTree.removeLeaf(earnManagerOne.publicKey);

//         // Update the earn manager merkle root on the global account
//         await propagateIndex(
//             new BN(1_110_000_000_000),
//             ZERO_WORD,
//             earnManagerMerkleTree.getRoot()
//         );

//         // Get the exclusion proof for earn manager one against the earn manager merkle tree
//         const {
//             proofs: earnManagerOneProofs,
//             neighbors: earnManagerOneNeighbors,
//         } = earnManagerMerkleTree.getExclusionProof(earnManagerOne.publicKey);

//         // Remove the earn manager account (set it to inactive)
//         await removeEarnManager(
//             earnManagerOne.publicKey,
//             earnManagerOneProofs,
//             earnManagerOneNeighbors
//         );

//         // Get the exclusion proof for the earner against the earner merkle tree
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             nonEarnerOne.publicKey
//         );

//         // Setup the instruction
//         prepAddEarner(earnManagerOne, earnManagerOne.publicKey, nonEarnerOneATA);

//         // Attempt to add earner with an inactive earn manager account
//         await expectAnchorError(
//             earn.methods
//                 .addEarner(nonEarnerOne.publicKey, proofs, neighbors)
//                 .accounts({ ...accounts })
//                 .signers([earnManagerOne])
//                 .rpc(),
//             "NotActive"
//         );
//     });

//     // given signer has an earn manager account initialized
//     // given earn manager account is active
//     // given earner already has an earner account
//     // it reverts with an account already initialized error
//     test("Earner account already initialized - reverts", async () => {
//         // Get the inclusion proof for earner one against the earner merkle tree
//         const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

//         // Add the earner via the registrar
//         await addRegistrarEarner(earnerOne.publicKey, proof);

//         // Get the ATA for earner one
//         const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

//         // Setup the instruction
//         prepAddEarner(earnManagerOne, earnManagerOne.publicKey, earnerOneATA);

//         // Attempt to add earner with an already initialized earner account
//         await expectSystemError(
//             earn.methods
//                 .addEarner(earnerOne.publicKey, [], [])
//                 .accounts({ ...accounts })
//                 .signers([earnManagerOne])
//                 .rpc()
//         );
//     });

//     // given signer has an earn manager account initialized
//     // given earn manager account is active
//     // given the earner does not already have an earner account
//     // given merkle proof for user exclusion from earner list is invalid
//     // it reverts with an AlreadyEarns error
//     test("Invalid merkle proof for user exclusion - reverts", async () => {
//         // Get the ATA for earner one
//         const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

//         // Get the exclusion proof for a different key against the earner merkle tree
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             nonAdmin.publicKey
//         );

//         // Setup the instruction
//         prepAddEarner(earnManagerOne, earnManagerOne.publicKey, earnerOneATA);

//         // Attempt to add earner with invalid merkle proof
//         await expectAnchorError(
//             earn.methods
//                 .addEarner(earnerOne.publicKey, proofs, neighbors)
//                 .accounts({ ...accounts })
//                 .signers([earnManagerOne])
//                 .rpc(),
//             "InvalidProof"
//         );
//     });

//     // given signer has an earn manager account initialized
//     // given earn manager account is active
//     // given the earner does not already have an earner account
//     // given merkle proof for user exclusion from earner list is valid
//     // given user token account is for the wrong token mint
//     // it reverts with an token mint constraint error
//     test("User token account is for the wrong token mint - reverts", async () => {
//         // Create a new mint for the user token account
//         const wrongMint = new Keypair();
//         await createMint(wrongMint, nonAdmin);

//         // Get the ATA for earner one
//         const nonEarnerOneATA = await getATA(
//             wrongMint.publicKey,
//             nonEarnerOne.publicKey
//         );

//         // Get the exclusion proof for the earner against the earner merkle tree
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             nonEarnerOne.publicKey
//         );

//         // Setup the instruction
//         prepAddEarner(earnManagerOne, earnManagerOne.publicKey, nonEarnerOneATA);

//         // Attempt to add earner with user token account for wrong token mint
//         await expectAnchorError(
//             earn.methods
//                 .addEarner(nonEarnerOne.publicKey, proofs, neighbors)
//                 .accounts({ ...accounts })
//                 .signers([earnManagerOne])
//                 .rpc(),
//             "ConstraintTokenMint"
//         );
//     });

//     // given signer has an earn manager account initialized
//     // given earn manager account is active
//     // given the earner does not already have an earner account
//     // given merkle proof for user exclusion from earner list is valid
//     // given user token account authority does not match the user pubkey
//     // it reverts with an address constraint error
//     test("User token account authority does not match user pubkey - reverts", async () => {
//         // Get the ATA for random user (not the same as the user)
//         const randomATA = await getATA(mint.publicKey, nonAdmin.publicKey);

//         // Get the exclusion proof for the earner against the earner merkle tree
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             nonEarnerOne.publicKey
//         );

//         // Setup the instruction
//         prepAddEarner(earnManagerOne, earnManagerOne.publicKey, randomATA);

//         // Attempt to add earner with user token account for wrong token mint
//         await expectAnchorError(
//             earn.methods
//                 .addEarner(nonEarnerOne.publicKey, proofs, neighbors)
//                 .accounts({ ...accounts })
//                 .signers([earnManagerOne])
//                 .rpc(),
//             "ConstraintTokenOwner"
//         );
//     });

//     test("Add earner with mutable token account - reverts", async () => {
//         const tokenAccountKeypair = Keypair.generate();
//         const tokenAccountLen = getAccountLen([]);
//         const lamports = await provider.connection.getMinimumBalanceForRentExemption(tokenAccountLen);

//         // Create token account without the immutable owner extension
//         const transaction = new Transaction().add(
//             SystemProgram.createAccount({
//                 fromPubkey: earnManagerOne.publicKey,
//                 newAccountPubkey: tokenAccountKeypair.publicKey,
//                 space: tokenAccountLen,
//                 lamports,
//                 programId: TOKEN_2022_PROGRAM_ID,
//             }),
//             createInitializeAccountInstruction(
//                 tokenAccountKeypair.publicKey,
//                 mint.publicKey,
//                 nonEarnerOne.publicKey,
//                 TOKEN_2022_PROGRAM_ID,
//             ),
//         );

//         await provider.send(transaction, [earnManagerOne, tokenAccountKeypair]);

//         // Get the exclusion proof for the earner against the earner merkle tree
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             nonEarnerOne.publicKey
//         );

//         // Setup the instruction
//         prepAddEarner(
//             earnManagerOne,
//             earnManagerOne.publicKey,
//             tokenAccountKeypair.publicKey
//         );

//         await expectAnchorError(
//             earn.methods
//                 .addEarner(nonEarnerOne.publicKey, proofs, neighbors)
//                 .accounts({ ...accounts })
//                 .signers([earnManagerOne])
//                 .rpc(),
//             "ImmutableOwner"
//         );
//     });

//     test("Add non-registrar earner - success", async () => {
//         const tokenAccountKeypair = Keypair.generate();
//         const tokenAccountLen = getAccountLen([ExtensionType.ImmutableOwner]);
//         const lamports = await provider.connection.getMinimumBalanceForRentExemption(tokenAccountLen);

//         // Create token account without the immutable owner extension
//         const transaction = new Transaction().add(
//             SystemProgram.createAccount({
//                 fromPubkey: earnManagerOne.publicKey,
//                 newAccountPubkey: tokenAccountKeypair.publicKey,
//                 space: tokenAccountLen,
//                 lamports,
//                 programId: TOKEN_2022_PROGRAM_ID,
//             }),
//             createInitializeImmutableOwnerInstruction(
//                 tokenAccountKeypair.publicKey,
//                 TOKEN_2022_PROGRAM_ID,
//             ),
//             createInitializeAccountInstruction(
//                 tokenAccountKeypair.publicKey,
//                 mint.publicKey,
//                 nonEarnerOne.publicKey,
//                 TOKEN_2022_PROGRAM_ID,
//             ),
//         );

//         await provider.send(transaction, [earnManagerOne, tokenAccountKeypair]);

//         // Get the exclusion proof for the earner against the earner merkle tree
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             nonEarnerOne.publicKey
//         );

//         // Setup the instruction
//         const { earnerAccount } = prepAddEarner(
//             earnManagerOne,
//             earnManagerOne.publicKey,
//             tokenAccountKeypair.publicKey
//         );

//         // Add earner one to the earn manager's list
//         await earn.methods
//             .addEarner(nonEarnerOne.publicKey, proofs, neighbors)
//             .accounts({ ...accounts })
//             .signers([earnManagerOne])
//             .rpc();

//         const currentTime = new BN(svm.getClock().unixTimestamp.toString());

//         // Verify the earner account was initialized correctly
//         await expectEarnerState(earnerAccount, {
//             earnManager: earnManagerOne.publicKey,
//             lastClaimIndex: new BN(1_100_000_000_000),
//             lastClaimTimestamp: currentTime,
//             user: nonEarnerOne.publicKey,
//             userTokenAccount: tokenAccountKeypair.publicKey,
//         });
//     });

//     // given signer has an earn manager account initialized
//     // given earn manager account is active
//     // given the earner does not already have an earner account
//     // given merkle proof for user exclusion from earner list is valid
//     // given user token account is for the correct token mint and the authority is the signer
//     // it creates the earner account
//     // it sets the earner is_active flag to true
//     // it sets the earn_manager to the provided earn manager pubkey
//     // it sets the last_claim_index to the current index
//     test("Add non-registrar earner ata - success", async () => {
//         // Get the ATA for non earner one
//         const nonEarnerOneATA = await getATA(
//             mint.publicKey,
//             nonEarnerOne.publicKey
//         );

//         // Get the exclusion proof for the earner against the earner merkle tree
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             nonEarnerOne.publicKey
//         );

//         // Setup the instruction
//         const { earnerAccount } = prepAddEarner(
//             earnManagerOne,
//             earnManagerOne.publicKey,
//             nonEarnerOneATA
//         );

//         // Add earner one to the earn manager's list
//         await earn.methods
//             .addEarner(nonEarnerOne.publicKey, proofs, neighbors)
//             .accounts({ ...accounts })
//             .signers([earnManagerOne])
//             .rpc();

//         const currentTime = new BN(svm.getClock().unixTimestamp.toString());

//         // Verify the earner account was initialized correctly
//         await expectEarnerState(earnerAccount, {
//             earnManager: earnManagerOne.publicKey,
//             lastClaimIndex: new BN(1_100_000_000_000),
//             lastClaimTimestamp: currentTime,
//             user: nonEarnerOne.publicKey,
//             userTokenAccount: nonEarnerOneATA,
//         });
//     });
// });

// describe("remove_earner unit tests", () => {
//     // test cases
//     // [X] given signer does not have an earn manager account initialized
//     //   [X] it reverts with an account not initialized error
//     // [X] given signer has an earn manager account initialized
//     //   [X] given earn manager account is not active
//     //     [X] it reverts with a NotAuthorized error
//     //   [X] given earn manager account is active
//     //     [X] given the earner account does not have an earn manager
//     //       [X] it reverts with a NotAuthorized error
//     //     [X] given the earner account has an earn manager
//     //       [X] given the earner's earn manager is not the signer
//     //         [X] it reverts with a NotAuthorized error
//     //       [X] given the earner's earn manager is the signer
//     //         [X] the earner account is closed and the signer refunded the rent

//     beforeEach(async () => {
//         // Initialize the program
//         await initialize(
//             mint.publicKey,
//             earnAuthority.publicKey,
//             initialIndex,
//             claimCooldown
//         );

//         // Populate the earner merkle tree with the initial earners
//         earnerMerkleTree = new MerkleTree([
//             admin.publicKey,
//             earnerOne.publicKey,
//             earnerTwo.publicKey,
//         ]);

//         // Populate the earn manager merkle tree with the initial earn managers
//         earnManagerMerkleTree = new MerkleTree([
//             earnManagerOne.publicKey,
//             earnManagerTwo.publicKey,
//         ]);

//         // Warp time forward past the initial cooldown period
//         warp(claimCooldown, true);

//         // Propagate a new index to start a new claim cycle and set the merkle roots
//         await propagateIndex(
//             new BN(1_100_000_000_000),
//             earnerMerkleTree.getRoot(),
//             earnManagerMerkleTree.getRoot()
//         );

//         // Get inclusion proof for earn manager one in the earn manager tree
//         const { proof: earnManagerOneProof } =
//             earnManagerMerkleTree.getInclusionProof(earnManagerOne.publicKey);

//         // Initialize earn manager one's account
//         await configureEarnManager(
//             earnManagerOne,
//             new BN(100),
//             earnManagerOneProof
//         );

//         // Get the exclusion proof for the earner against the earner merkle tree
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             nonEarnerOne.publicKey
//         );

//         // Add non earner one as an earner under earn manager one
//         await addEarner(
//             earnManagerOne,
//             nonEarnerOne.publicKey,
//             proofs,
//             neighbors
//         );
//     });

//     // given signer does not have an earn manager account initialized
//     // it reverts with an account not initialized error
//     test("Signer earn manager account not initialized - reverts", async () => {
//         // Get the ATA for non earner one
//         const nonEarnerOneATA = await getATA(
//             mint.publicKey,
//             nonEarnerOne.publicKey
//         );

//         // Setup the instruction
//         prepRemoveEarner(
//             nonEarnManagerOne,
//             nonEarnManagerOne.publicKey,
//             nonEarnerOneATA
//         );

//         // Attempt to remove earner without an initialized earn manager account
//         await expectAnchorError(
//             earn.methods
//                 .removeEarner()
//                 .accounts({ ...accounts })
//                 .signers([nonEarnManagerOne])
//                 .rpc(),
//             "AccountNotInitialized"
//         );
//     });

//     // given signer has an earn manager account initialized
//     // given earn manager account is not active
//     // it reverts with a NotActive error
//     test("Signer's earn manager account not active - reverts", async () => {
//         // Get the ATA for non earner one
//         const nonEarnerOneATA = await getATA(
//             mint.publicKey,
//             nonEarnerOne.publicKey
//         );

//         // Remove earn manager one from the earn manager merkle tree
//         earnManagerMerkleTree.removeLeaf(earnManagerOne.publicKey);

//         // Update the earn manager merkle root on the global account
//         await propagateIndex(
//             new BN(1_110_000_000_000),
//             ZERO_WORD,
//             earnManagerMerkleTree.getRoot()
//         );

//         // Get exclusion proof for earn manager one in the earn manager tree
//         const { proofs, neighbors } = earnManagerMerkleTree.getExclusionProof(
//             earnManagerOne.publicKey
//         );

//         // Remove the earn manager account (set it to inactive)
//         await removeEarnManager(earnManagerOne.publicKey, proofs, neighbors);

//         // Setup the instruction
//         prepRemoveEarner(
//             earnManagerOne,
//             earnManagerOne.publicKey,
//             nonEarnerOneATA
//         );

//         // Attempt to remove earner with an inactive earn manager account
//         await expectAnchorError(
//             earn.methods
//                 .removeEarner()
//                 .accounts({ ...accounts })
//                 .signers([earnManagerOne])
//                 .rpc(),
//             "NotActive"
//         );
//     });

//     // given signer has an earn manager account initialized
//     // given earn manager account is active
//     // given the earner account does not have an earn manager
//     // it reverts with a NotAuthorized error
//     test("Earner account does not have an earn manager - reverts", async () => {
//         // Get the inclusion proof for earner one in the earner merkle tree
//         const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

//         // Add the earner via the registrar
//         await addRegistrarEarner(earnerOne.publicKey, proof);

//         // Get the ATA for earner one
//         const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

//         // Setup the instruction
//         prepRemoveEarner(earnManagerOne, earnManagerOne.publicKey, earnerOneATA);

//         // Attempt to remove earner without an earn manager
//         await expectAnchorError(
//             earn.methods
//                 .removeEarner()
//                 .accounts({ ...accounts })
//                 .signers([earnManagerOne])
//                 .rpc(),
//             "NotAuthorized"
//         );
//     });

//     // given signer has an earn manager account initialized
//     // given earn manager account is active
//     // given the earner account has an earn manager
//     // given the earner's earn manager is not the signer
//     // it reverts with a NotAuthorized error
//     test("Earner's earn manager is not signer - reverts", async () => {
//         // Get the inclusion proof for earn manager two
//         const { proof } = earnManagerMerkleTree.getInclusionProof(
//             earnManagerTwo.publicKey
//         );

//         // Configure earn manager two's account (and create it)
//         await configureEarnManager(earnManagerTwo, new BN(100), proof);

//         // Get the ATA for non earner one
//         const nonEarnerOneATA = await getATA(
//             mint.publicKey,
//             nonEarnerOne.publicKey
//         );

//         // Setup the instruction
//         prepRemoveEarner(
//             earnManagerTwo,
//             earnManagerTwo.publicKey,
//             nonEarnerOneATA
//         );

//         // Attempt to remove earner with the wrong earn manager
//         await expectAnchorError(
//             earn.methods
//                 .removeEarner()
//                 .accounts({ ...accounts })
//                 .signers([earnManagerTwo])
//                 .rpc(),
//             "NotAuthorized"
//         );
//     });

//     // given signer has an earn manager account initialized
//     // given earn manager account is active
//     // given the earner account has an earn manager
//     // given the earner's earn manager is the signer
//     // it closes the earner account and refunds the rent
//     test("Earner's earn manager is signer - success", async () => {
//         // Get the ATA for non earner one
//         const nonEarnerOneATA = await getATA(
//             mint.publicKey,
//             nonEarnerOne.publicKey
//         );

//         // Setup the instruction
//         const { earnerAccount } = prepRemoveEarner(
//             earnManagerOne,
//             earnManagerOne.publicKey,
//             nonEarnerOneATA
//         );

//         // Remove the earner account
//         await earn.methods
//             .removeEarner()
//             .accounts({ ...accounts })
//             .signers([earnManagerOne])
//             .rpc();

//         // Verify the earner account was closed
//         expectAccountEmpty(earnerAccount);
//     });
// });

// describe("add_registrar_earner unit tests", () => {
//     // test cases
//     // [X] given the earner tree is empty and the user is the zero value pubkey
//     //   [X] it reverts with an InvalidParam error
//     // [X] given the user token account is for the wrong token mint
//     //   [X] it reverts with a constraint token mint error
//     // [X] given the user token account is not for the user pubkey
//     //   [X] it reverts with a constraint token owner error
//     // [X] given the user token account is not initialized
//     //   [X] it reverts with an account not initialized error
//     // [X] given the earner account is already initialized
//     //   [X] it reverts with an account already initialized error
//     // [X] given all the accounts are valid
//     //   [X] given the merkle proof for the user in the earner list is invalid
//     //     [X] it reverts with an InvalidProof error
//     //   [X] given the merkle proof for the user in the earner list is valid
//     //     [X] it creates the earner account
//     //     [X] it sets the earner account's user to the provided pubkey
//     //     [X] it sets the earner account's user_token_account to the provided token account
//     //     [X] it sets the earner account's earn_manager to None
//     //     [X] it sets the earner account's last_claim_index to the current index

//     beforeEach(async () => {
//         // Initialize the program
//         await initialize(
//             mint.publicKey,
//             earnAuthority.publicKey,
//             initialIndex,
//             claimCooldown
//         );

//         // Populate the earner merkle tree with the initial earners
//         earnerMerkleTree = new MerkleTree([
//             admin.publicKey,
//             earnerOne.publicKey,
//             earnerTwo.publicKey,
//         ]);

//         // Populate the earn manager merkle tree with the initial earn managers
//         earnManagerMerkleTree = new MerkleTree([
//             earnManagerOne.publicKey,
//             earnManagerTwo.publicKey,
//         ]);

//         // Warp time forward past the initial cooldown period
//         warp(claimCooldown, true);

//         // Propagate a new index to start a new claim cycle and set the merkle roots
//         await propagateIndex(
//             new BN(1_100_000_000_000),
//             earnerMerkleTree.getRoot(),
//             earnManagerMerkleTree.getRoot()
//         );
//     });

//     test("Earner tree is empty and user is zero value - reverts", async () => {
//         // Remove all earners from the merkle tree
//         earnerMerkleTree = new MerkleTree([]);

//         // Propagate the new merkle root
//         await propagateIndex(
//             new BN(1_100_000_000_000),
//             earnerMerkleTree.getRoot(),
//             earnManagerMerkleTree.getRoot()
//         );

//         // Get the ATA for the zero value pubkey
//         const zeroATA = await getATA(mint.publicKey, PublicKey.default);

//         // Get the inclusion proof for the zero value pubkey in the earner merkle tree
//         const { proof } = earnerMerkleTree.getInclusionProof(PublicKey.default);

//         // Setup the instruction
//         prepAddRegistrarEarner(nonAdmin, zeroATA);

//         // Attempt to add earner with empty tree and zero value pubkey
//         await expectAnchorError(
//             earn.methods
//                 .addRegistrarEarner(PublicKey.default, proof)
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "InvalidParam"
//         );

//     });

//     // given the user token account is for the wrong token mint
//     // it reverts with a constraint token mint error
//     test("User token account is for the wrong token mint - reverts", async () => {
//         // Create a new token mint
//         const wrongMint = new Keypair();
//         await createMint(wrongMint, nonAdmin);

//         // Get earner one ATA for the wrong mint
//         const wrongATA = await getATA(wrongMint.publicKey, earnerOne.publicKey);

//         // Get the inclusion proof for earner one in the earner merkle tree
//         const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

//         // Setup the instruction
//         prepAddRegistrarEarner(nonAdmin, wrongATA);

//         // Attempt to add earner with wrong token mint
//         await expectAnchorError(
//             earn.methods
//                 .addRegistrarEarner(earnerOne.publicKey, proof)
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "ConstraintTokenMint"
//         );
//     });

//     // given the user token account is not owned by the user pubkey
//     // it reverts with a constraint token owner error
//     test("User token account authority does not match user pubkey - reverts", async () => {
//         // Get the ATA for a random user
//         const randomATA = await getATA(mint.publicKey, nonAdmin.publicKey);

//         // Get the inclusion proof for earner one in the earner merkle tree
//         const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

//         // Setup the instruction
//         prepAddRegistrarEarner(nonAdmin, randomATA);

//         // Attempt to add earner with wrong token owner
//         await expectAnchorError(
//             earn.methods
//                 .addRegistrarEarner(earnerOne.publicKey, proof)
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "ConstraintTokenOwner"
//         );
//     });

//     // given the user token account is not initialized
//     // it reverts with an account not initialized error
//     test("User token account is not initialized - reverts", async () => {
//         // Calculate the ATA for earner one, but don't create it
//         const nonInitATA = getAssociatedTokenAddressSync(
//             mint.publicKey,
//             earnerOne.publicKey,
//             true,
//             TOKEN_2022_PROGRAM_ID,
//             ASSOCIATED_TOKEN_PROGRAM_ID
//         );

//         // Get the inclusion proof for earner one in the earner merkle tree
//         const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

//         // Setup the instruction
//         prepAddRegistrarEarner(nonAdmin, nonInitATA);

//         // Attempt to add earner with uninitialized token account
//         await expectAnchorError(
//             earn.methods
//                 .addRegistrarEarner(earnerOne.publicKey, proof)
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "AccountNotInitialized"
//         );
//     });

//     // given the earner account is already initialized
//     // it reverts with an account already initialized error
//     test("Earner account already initialized - reverts", async () => {
//         // Get the ATA for earner one
//         const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

//         // Get the inclusion proof for earner one in the earner merkle tree
//         const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

//         // Add earner one to the earn manager's list
//         await addRegistrarEarner(earnerOne.publicKey, proof);

//         // Setup the instruction
//         prepAddRegistrarEarner(nonAdmin, earnerOneATA);

//         // Attempt to add earner with already initialized account
//         await expectSystemError(
//             earn.methods
//                 .addRegistrarEarner(earnerOne.publicKey, proof)
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc()
//         );
//     });

//     // given all the accounts are valid
//     // given the merkle proof for the user in the earner list is invalid
//     // it reverts with an InvalidProof error
//     test("Invalid merkle proof for user inclusion - reverts", async () => {
//         // Get the ATA for non earner one
//         const nonEarnerOneATA = await getATA(
//             mint.publicKey,
//             nonEarnerOne.publicKey
//         );

//         // Get the inclusion proof for earner one in the earner merkle tree
//         const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

//         // Setup the instruction
//         prepAddRegistrarEarner(nonAdmin, nonEarnerOneATA);

//         // Attempt to add earner with invalid merkle proof
//         await expectAnchorError(
//             earn.methods
//                 .addRegistrarEarner(nonEarnerOne.publicKey, proof)
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "InvalidProof"
//         );
//     });

//     // given all the accounts are valid
//     // given the merkle proof for the user in the earner list is valid
//     // it creates the earner account
//     // it sets the earner account's earn_manager to None
//     // it sets the earner account's last_claim_index to the current index
//     test("Add registrar earner - success", async () => {
//         // Get the ATA for earner one
//         const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

//         // Get the inclusion proof for earner one in the earner merkle tree
//         const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

//         // Setup the instruction
//         const { earnerAccount } = prepAddRegistrarEarner(nonAdmin, earnerOneATA);

//         // Add earner one to the earn manager's list
//         await earn.methods
//             .addRegistrarEarner(earnerOne.publicKey, proof)
//             .accounts({ ...accounts })
//             .signers([nonAdmin])
//             .rpc();

//         const currentTime = new BN(svm.getClock().unixTimestamp.toString());

//         // Verify the earner account was initialized correctly
//         await expectEarnerState(earnerAccount, {
//             earnManager: null,
//             lastClaimIndex: new BN(1_100_000_000_000),
//             lastClaimTimestamp: currentTime,
//             user: earnerOne.publicKey,
//             userTokenAccount: earnerOneATA,
//         });
//     });
// });

// describe("remove_registrar_earner unit tests", () => {
//     // test cases
//     // [X] given the earner account is not initialized
//     //   [X] it reverts with an account not initialized error
//     // [X] given all the accounts are valid
//     //   [X] given empty merkle proof for user exclusion
//     //     [X] it reverts with an InvalidProof error
//     //   [X] given the merkle proof for user's exclusion from the earner list is invalid
//     //     [X] it reverts with an InvalidProof error
//     //   [X] given the merkle proof for user's exclusion from the earner list is valid
//     //     [X] given the earner account has an earn manager
//     //       [X] it reverts with a NotAuthorized error
//     //     [X] given the earner account does not have an earn manager
//     //       [X] it closes the earner account and refunds the rent to the signer

//     beforeEach(async () => {
//         // Initialize the program
//         await initialize(
//             mint.publicKey,
//             earnAuthority.publicKey,
//             initialIndex,
//             claimCooldown
//         );

//         // Populate the earner merkle tree with the initial earners
//         earnerMerkleTree = new MerkleTree([
//             admin.publicKey,
//             earnerOne.publicKey,
//             earnerTwo.publicKey,
//         ]);

//         // Populate the earn manager merkle tree with the initial earn managers
//         earnManagerMerkleTree = new MerkleTree([
//             earnManagerOne.publicKey,
//             earnManagerTwo.publicKey,
//         ]);

//         // Warp time forward past the initial cooldown period
//         warp(claimCooldown, true);

//         // Propagate a new index to start a new claim cycle and set the merkle roots
//         await propagateIndex(
//             new BN(1_100_000_000_000),
//             earnerMerkleTree.getRoot(),
//             earnManagerMerkleTree.getRoot()
//         );

//         // Create an earner account for earner one
//         const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);
//         await addRegistrarEarner(earnerOne.publicKey, proof);

//         // Remove earner one from the earner merkle tree
//         earnerMerkleTree.removeLeaf(earnerOne.publicKey);

//         // Update the earner merkle root on the global account
//         const { globalAccount } = await propagateIndex(
//             new BN(1_100_000_000_000),
//             earnerMerkleTree.getRoot(),
//             ZERO_WORD
//         );

//         // Confirm the global account is updated
//         expectGlobalState(globalAccount, {
//             index: new BN(1_100_000_000_000),
//             earnerMerkleRoot: earnerMerkleTree.getRoot(),
//             earnManagerMerkleRoot: earnManagerMerkleTree.getRoot(),
//         });
//     });

//     // given the earner account is not initialized
//     // it reverts with an account not initialized error
//     test("Earner account is not initialized - reverts", async () => {
//         // Get the ATA for non earner one
//         const nonEarnerOneATA = await getATA(
//             mint.publicKey,
//             nonEarnerOne.publicKey
//         );

//         // Get the exclusion proof for non earner one against the earner merkle tree
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             nonEarnerOne.publicKey
//         );

//         // Setup the instruction
//         prepRemoveRegistrarEarner(nonAdmin, nonEarnerOneATA);

//         // Attempt to remove earner with uninitialized account
//         await expectAnchorError(
//             earn.methods
//                 .removeRegistrarEarner(proofs, neighbors)
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "AccountNotInitialized"
//         );
//     });

//     // given all the accounts are valid
//     // given no proofs or neighbors are provided
//     // it reverts with an InvalidProof error
//     test("Empty merkle proof for user exclusion - reverts", async () => {
//         // Get the ATA for earner one
//         const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

//         // Setup the instruction
//         prepRemoveRegistrarEarner(nonAdmin, earnerOneATA);

//         // Attempt to remove earner with invalid merkle proof
//         await expectAnchorError(
//             earn.methods
//                 .removeRegistrarEarner([], [])
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "InvalidProof"
//         );
//     });

//     // given all the accounts are valid
//     // given the merkle proof for user's exclusion from the earner list is invalid
//     // it reverts with an InvalidProof error
//     test("Invalid merkle proof for user exclusion - reverts", async () => {
//         // Create earner account for earner two
//         await addRegistrarEarner(
//             earnerTwo.publicKey,
//             earnerMerkleTree.getInclusionProof(earnerTwo.publicKey).proof
//         );

//         // Get the ATA for earner two
//         const earnerTwoATA = await getATA(mint.publicKey, earnerTwo.publicKey);

//         // Get the exclusion proof for earner one against the earner merkle tree
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             earnerOne.publicKey
//         );

//         // Setup the instruction
//         prepRemoveRegistrarEarner(nonAdmin, earnerTwoATA);

//         // Attempt to remove earner with invalid merkle proof
//         await expectAnchorError(
//             earn.methods
//                 .removeRegistrarEarner(proofs, neighbors)
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "InvalidProof"
//         );
//     });

//     // given all the accounts are valid
//     // given the merkle proof for user's exclusion from the earner list is valid
//     // given the earner account has an earn manager
//     // it reverts with a NotAuthorized error
//     test("Earner account has an earn manager - reverts", async () => {
//         // Configure account for earn manager one
//         const { proof } = earnManagerMerkleTree.getInclusionProof(
//             earnManagerOne.publicKey
//         );
//         await configureEarnManager(earnManagerOne, new BN(100), proof);

//         // Add non earner one as an earner under earn manager one
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             nonEarnerOne.publicKey
//         );
//         await addEarner(
//             earnManagerOne,
//             nonEarnerOne.publicKey,
//             proofs,
//             neighbors
//         );

//         // Get the ATA for non earner one
//         const nonEarnerOneATA = await getATA(
//             mint.publicKey,
//             nonEarnerOne.publicKey
//         );

//         // Setup the instruction
//         prepRemoveRegistrarEarner(nonAdmin, nonEarnerOneATA);

//         // Attempt to remove earner with an earn manager
//         await expectAnchorError(
//             earn.methods
//                 .removeRegistrarEarner(proofs, neighbors)
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "NotAuthorized"
//         );
//     });

//     // given all the accounts are valid
//     // given the merkle proof for user's exclusion from the earner list is valid
//     // given the earner account does not have an earn manager
//     // it closes the earner account and refunds the rent to the signer
//     test("Remove registrar earner - success", async () => {
//         // Get the ATA for earner one
//         const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

//         // Get the exclusion proof for earner one against the earner merkle tree
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             earnerOne.publicKey
//         );

//         // Setup the instruction
//         const { earnerAccount } = prepRemoveRegistrarEarner(
//             nonAdmin,
//             earnerOneATA
//         );

//         // Remove earner one from the earn manager's list
//         await earn.methods
//             .removeRegistrarEarner(proofs, neighbors)
//             .accounts({ ...accounts })
//             .signers([nonAdmin])
//             .rpc();

//         // Verify the earner account was closed correctly
//         expectAccountEmpty(earnerAccount);
//     });
// });

// describe("remove_earn_manager unit tests", () => {
//     // test cases
//     // [X] given the earn manager account is not initialized
//     //   [X] it reverts with an account not initialized error
//     // [X] given the earn manager account is initialized
//     //   [X] given the earn manager account is not active
//     //     [X] it reverts with a NotActive error
//     //   [X] given the earn manager account is active
//     //     [X] given the merkle proof for the earn manager's exclusion from the earn manager list is invalid
//     //       [X] it reverts with a NotAuthorized error
//     //     [X] given the merkle proof for the earn manager's exclusion from the earn manager list is valid
//     //       [X] it sets the earn manager account's is_active flag to false

//     beforeEach(async () => {
//         // Initialize the program
//         await initialize(
//             mint.publicKey,
//             earnAuthority.publicKey,
//             initialIndex,
//             claimCooldown
//         );

//         // Populate the earn manager merkle tree with the initial earn managers
//         earnManagerMerkleTree = new MerkleTree([
//             earnManagerOne.publicKey,
//             earnManagerTwo.publicKey,
//         ]);

//         // Warp time forward past the initial cooldown period
//         warp(claimCooldown, true);

//         // Propagate a new index to start a new claim cycle and set the merkle roots
//         await propagateIndex(
//             new BN(1_100_000_000_000),
//             ZERO_WORD,
//             earnManagerMerkleTree.getRoot()
//         );

//         // Get the inclusion proof for earn manager one in the earn manager tree
//         const { proof } = earnManagerMerkleTree.getInclusionProof(
//             earnManagerOne.publicKey
//         );

//         // Initialize earn manager one's account
//         await configureEarnManager(earnManagerOne, new BN(100), proof);
//     });

//     // given the earn manager account is not initialized
//     // it reverts with an account not initialized error
//     test("Earn manager account is not initialized - reverts", async () => {
//         // Try to remove an earn manager that doesn't exist
//         // Get the exclusion proof for non existent earn manager
//         const { proofs, neighbors } = earnManagerMerkleTree.getExclusionProof(
//             nonEarnManagerOne.publicKey
//         );

//         // Setup the instruction
//         prepRemoveEarnManager(nonAdmin, nonEarnManagerOne.publicKey);

//         // Attempt to remove earn manager that doesn't exist
//         await expectAnchorError(
//             earn.methods
//                 .removeEarnManager(nonEarnManagerOne.publicKey, proofs, neighbors)
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "AccountNotInitialized"
//         );
//     });

//     // given the earn manager account is initialized
//     // given the earn manager account is not active
//     // it reverts with a NotActive error
//     test("Earn manager account is not active - reverts", async () => {
//         // Remove earn manager one from the earn manager merkle tree
//         earnManagerMerkleTree.removeLeaf(earnManagerOne.publicKey);

//         // Update the earn manager merkle root on the global account
//         await propagateIndex(
//             new BN(1_100_000_000_000),
//             ZERO_WORD,
//             earnManagerMerkleTree.getRoot()
//         );

//         // Get the exclusion proof for earn manager one in the earn manager tree
//         const { proofs, neighbors } = earnManagerMerkleTree.getExclusionProof(
//             earnManagerOne.publicKey
//         );

//         // Remove the earn manager account (set it to inactive)
//         await removeEarnManager(earnManagerOne.publicKey, proofs, neighbors);

//         // Expire the blockhash to be able to send the same instruction again
//         svm.expireBlockhash();

//         // Setup the instruction
//         prepRemoveEarnManager(nonAdmin, earnManagerOne.publicKey);

//         // Attempt to remove earn manager that is not active
//         await expectAnchorError(
//             earn.methods
//                 .removeEarnManager(earnManagerOne.publicKey, proofs, neighbors)
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "NotActive"
//         );
//     });

//     // given the earn manager account is initialized
//     // given the earn manager account is active
//     // given the merkle proof for the earn manager's exclusion from the earn manager list is invalid
//     // it reverts with a InvalidProof error
//     test("Invalid merkle proof for earn manager exclusion - reverts", async () => {
//         // Get the exclusion proof for non existent earn manager
//         const { proofs, neighbors } = earnManagerMerkleTree.getExclusionProof(
//             nonEarnManagerOne.publicKey
//         );

//         // Setup the instruction
//         prepRemoveEarnManager(nonAdmin, earnManagerOne.publicKey);

//         // Attempt to remove earn manager with invalid merkle proof
//         await expectAnchorError(
//             earn.methods
//                 .removeEarnManager(earnManagerOne.publicKey, proofs, neighbors)
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "InvalidProof"
//         );
//     });

//     // given the earn manager account is initialized
//     // given the earn manager account is active
//     // given the merkle proof for the earn manager's exclusion from the earn manager list is valid
//     // it sets the earn manager account's is_active flag to false
//     test("Remove earn manager - success", async () => {
//         // Remove earn manager one from the earn manager merkle tree
//         earnManagerMerkleTree.removeLeaf(earnManagerOne.publicKey);

//         // Update the earn manager merkle root on the global account
//         const { globalAccount } = await propagateIndex(
//             new BN(1_100_000_000_000),
//             ZERO_WORD,
//             earnManagerMerkleTree.getRoot()
//         );

//         // Get the exclusion proof for earn manager one in the earn manager tree
//         const { proofs, neighbors } = earnManagerMerkleTree.getExclusionProof(
//             earnManagerOne.publicKey
//         );

//         // Confirm the earn manager account is still active
//         const earnManagerAccount = getEarnManagerAccount(
//             earnManagerOne.publicKey
//         );
//         await expectEarnManagerState(earnManagerAccount, {
//             isActive: true,
//         });

//         // Setup the instruction
//         prepRemoveEarnManager(nonAdmin, earnManagerOne.publicKey);

//         // Remove the earn manager account
//         await earn.methods
//             .removeEarnManager(earnManagerOne.publicKey, proofs, neighbors)
//             .accounts({ ...accounts })
//             .signers([nonAdmin])
//             .rpc();

//         // Verify the earn manager account was set to inactive
//         await expectEarnManagerState(earnManagerAccount, {
//             isActive: false,
//         });
//     });

//     test("Remove all earn managers - success", async () => {
//         // Create an earn account for the second earn manager
//         const { proof } = earnManagerMerkleTree.getInclusionProof(
//             earnManagerTwo.publicKey
//         );

//         // Initialize earn manager two's account
//         await configureEarnManager(earnManagerTwo, new BN(100), proof);

//         // Remove one earn manager from the tree
//         earnManagerMerkleTree.removeLeaf(earnManagerOne.publicKey);

//         // Update the earn manager merkle root on the global account
//         await propagateIndex(
//             new BN(1_100_000_000_000),
//             ZERO_WORD,
//             earnManagerMerkleTree.getRoot()
//         );

//         // Get the exclusion proof for earn manager one in the earn manager tree
//         const { proofs: proofsOne, neighbors: neighborsOne } = earnManagerMerkleTree.getExclusionProof(
//             earnManagerOne.publicKey
//         );

//         // Confirm the earn manager account is still active
//         let earnManagerAccount = getEarnManagerAccount(
//             earnManagerOne.publicKey
//         );
//         await expectEarnManagerState(earnManagerAccount, {
//             isActive: true,
//         });

//         // Setup the instruction
//         prepRemoveEarnManager(nonAdmin, earnManagerOne.publicKey);

//         // Remove the earn manager account
//         await earn.methods
//             .removeEarnManager(earnManagerOne.publicKey, proofsOne, neighborsOne)
//             .accounts({ ...accounts })
//             .signers([nonAdmin])
//             .rpc();

//         // Verify the earn manager account was set to inactive
//         await expectEarnManagerState(earnManagerAccount, {
//             isActive: false,
//         });

//         // Remove the other earn manager from the tree
//         earnManagerMerkleTree.removeLeaf(earnManagerTwo.publicKey);

//         // Update the earn manager merkle root on the global account
//         await propagateIndex(
//             new BN(1_100_000_000_000),
//             ZERO_WORD,
//             earnManagerMerkleTree.getRoot()
//         );

//         // Get the exclusion proof for earn manager two in the earn manager tree
//         const { proofs: proofsTwo, neighbors: neighborsTwo } = earnManagerMerkleTree.getExclusionProof(earnManagerTwo.publicKey);

//         // Confirm the earn manager account is still active
//         earnManagerAccount = getEarnManagerAccount(earnManagerTwo.publicKey);
//         await expectEarnManagerState(earnManagerAccount, {
//             isActive: true,
//         });

//         // Setup the instruction
//         prepRemoveEarnManager(nonAdmin, earnManagerTwo.publicKey);

//         // Remove the earn manager account
//         await earn.methods
//             .removeEarnManager(earnManagerTwo.publicKey, proofsTwo, neighborsTwo)
//             .accounts({ ...accounts })
//             .signers([nonAdmin])
//             .rpc();

//         // Verify the earn manager account was set to inactive
//         await expectEarnManagerState(earnManagerAccount, {
//             isActive: false,
//         });

//     });
// });

// describe("remove_orphaned_earner unit tests", () => {
//     // test cases
//     // [X] given the earner account is not initialized
//     //   [X] it reverts with an account not initialized error
//     // [X] given the earn manager account is not initialized
//     //   [X] it reverts with an account not initialized error
//     // [X] given the earner does not have an earn manager
//     //   [X] it reverts with a panic since it tries to unwrap a None value
//     // [X] given all the accounts are valid
//     //   [X] given the earner has an earn manager
//     //     [X] given the earn manager account is active
//     //       [X] it reverts with a NotAuthorized error
//     //     [X] given the earn manager account is not active
//     //       [X] it closes the earner account and refunds the rent to the signer

//     beforeEach(async () => {
//         // Initialize the program
//         await initialize(
//             mint.publicKey,
//             earnAuthority.publicKey,
//             initialIndex,
//             claimCooldown
//         );

//         // Populate the earner merkle tree with the initial earners
//         earnerMerkleTree = new MerkleTree([
//             admin.publicKey,
//             earnerOne.publicKey,
//             earnerTwo.publicKey,
//         ]);

//         // Populate the earn manager merkle tree with the initial earn managers
//         earnManagerMerkleTree = new MerkleTree([
//             earnManagerOne.publicKey,
//             earnManagerTwo.publicKey,
//         ]);

//         // Warp time forward past the initial cooldown period
//         warp(claimCooldown, true);

//         // Propagate a new index to start a new claim cycle and set the merkle roots
//         await propagateIndex(
//             new BN(1_100_000_000_000),
//             earnerMerkleTree.getRoot(),
//             earnManagerMerkleTree.getRoot()
//         );

//         // Get the inclusion proof for earn manager one in the earn manager tree
//         const { proof: earnManagerProof } =
//             earnManagerMerkleTree.getInclusionProof(earnManagerOne.publicKey);

//         // Initialize earn manager one's account
//         await configureEarnManager(earnManagerOne, new BN(100), earnManagerProof);

//         // Add non earner one as an earner under earn manager one
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             nonEarnerOne.publicKey
//         );
//         await addEarner(
//             earnManagerOne,
//             nonEarnerOne.publicKey,
//             proofs,
//             neighbors
//         );

//         // Add earner one as a registrar earner
//         const { proof: earnerProof } = earnerMerkleTree.getInclusionProof(
//             earnerOne.publicKey
//         );
//         await addRegistrarEarner(earnerOne.publicKey, earnerProof);
//     });

//     // given the earner account is not initialized
//     // it reverts with an account not initialized error
//     test("Earner account is not initialized - reverts", async () => {
//         // Calculate the ATA for earner one, but don't create it
//         const nonInitATA = getAssociatedTokenAddressSync(
//             mint.publicKey,
//             earnerTwo.publicKey,
//             true,
//             TOKEN_2022_PROGRAM_ID,
//             ASSOCIATED_TOKEN_PROGRAM_ID
//         );

//         // Setup the instruction
//         prepRemoveOrphanedEarner(nonAdmin, nonInitATA, earnManagerOne.publicKey);

//         // Attempt to remove orphaned earner with uninitialized token account
//         await expectAnchorError(
//             earn.methods
//                 .removeOrphanedEarner()
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "AccountNotInitialized"
//         );
//     });

//     // given the earn manager account is not initialized
//     // it reverts with an account not initialized error
//     test("Earn manager account is not initialized - reverts", async () => {
//         // Get the ATA for non earner one
//         const nonEarnerOneATA = await getATA(
//             mint.publicKey,
//             nonEarnerOne.publicKey
//         );

//         // Prepare the instruction
//         prepRemoveOrphanedEarner(
//             nonAdmin,
//             nonEarnerOneATA,
//             earnManagerTwo.publicKey
//         );

//         // Attempt to remove orphaned earner with uninitialized earn manager account
//         await expectAnchorError(
//             earn.methods
//                 .removeOrphanedEarner()
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "AccountNotInitialized"
//         );
//     });

//     // given the earner does not have an earn manager
//     // it reverts with a panic since the earn manager verification cannot unwrap a None value
//     test("Earner does not have an earn manager - reverts", async () => {
//         // Get the ATA for earner one
//         const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

//         // Prep the instruction
//         prepRemoveOrphanedEarner(
//             nonAdmin,
//             earnerOneATA,
//             earnManagerOne.publicKey
//         );

//         // Attempt to remove orphaned earner without an earn manager
//         await expectSystemError(
//             earn.methods
//                 .removeOrphanedEarner()
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc()
//         );
//     });

//     // given all the accounts are valid
//     // given the earner has an earn manager
//     // given the earn manager account is active
//     // it reverts with a NotAuthorized error
//     test("Earn manager account is active - reverts", async () => {
//         // Get the ATA for non earner one
//         const nonEarnerOneATA = await getATA(
//             mint.publicKey,
//             nonEarnerOne.publicKey
//         );

//         // Setup the instruction
//         prepRemoveOrphanedEarner(
//             nonAdmin,
//             nonEarnerOneATA,
//             earnManagerOne.publicKey
//         );

//         // Attempt to remove orphaned earner with an active earn manager
//         await expectAnchorError(
//             earn.methods
//                 .removeOrphanedEarner()
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "NotAuthorized"
//         );
//     });

//     // given all the accounts are valid
//     // given the earner has an earn manager
//     // given the earn manager account is not active
//     // it closes the earner account and refunds the rent to the signer
//     test("Remove orphaned earner - success", async () => {
//         // Remove earn manager one from the earn manager merkle tree
//         earnManagerMerkleTree.removeLeaf(earnManagerOne.publicKey);

//         // Propagate the new earn manager merkle root
//         await propagateIndex(
//             new BN(1_100_000_000_000),
//             ZERO_WORD,
//             earnManagerMerkleTree.getRoot()
//         );

//         // Get exclusion proof for earn manager one
//         const { proofs, neighbors } = earnManagerMerkleTree.getExclusionProof(
//             earnManagerOne.publicKey
//         );

//         // Remove the earn manager account (set it to inactive)
//         await removeEarnManager(earnManagerOne.publicKey, proofs, neighbors);

//         // Get the ATA for non earner one
//         const nonEarnerOneATA = await getATA(
//             mint.publicKey,
//             nonEarnerOne.publicKey
//         );

//         // Setup the instruction
//         const { earnerAccount } = prepRemoveOrphanedEarner(
//             nonAdmin,
//             nonEarnerOneATA,
//             earnManagerOne.publicKey
//         );

//         // Confirm that the account is active and earning
//         await expectEarnerState(earnerAccount, {
//             earnManager: earnManagerOne.publicKey,
//         });

//         // Remove the orphaned earner
//         try {
//             await earn.methods
//                 .removeOrphanedEarner()
//                 .accounts({ ...accounts })
//                 .signers([nonAdmin])
//                 .rpc();
//         } catch (e) {
//             console.log(e);
//             expect(true).toBe(false);
//         }

//         // Verify the earner account was closed
//         expectAccountEmpty(earnerAccount);
//     });
// });

// describe("set_earner_recipient unit tests", () => {
//     beforeEach(async () => {
//         // Initialize the program
//         await initialize(
//             mint.publicKey,
//             earnAuthority.publicKey,
//             initialIndex,
//             claimCooldown
//         );

//         // Populate the earner merkle tree with the initial earners
//         earnerMerkleTree = new MerkleTree([
//             admin.publicKey,
//             earnerOne.publicKey,
//         ]);

//         // Populate the earn manager merkle tree with the initial earn managers
//         earnManagerMerkleTree = new MerkleTree([
//             earnManagerOne.publicKey,
//         ]);

//         // Warp past the initial cooldown period
//         warp(claimCooldown, true);

//         // Propagate the earner and earn manager merkle roots so we can add earners
//         await propagateIndex(
//             initialIndex,
//             earnerMerkleTree.getRoot(),
//             earnManagerMerkleTree.getRoot()
//         );

//         // Add earner one as a registrar earner
//         const { proof: earnerOneProof } = earnerMerkleTree.getInclusionProof(
//             earnerOne.publicKey
//         );
//         await addRegistrarEarner(earnerOne.publicKey, earnerOneProof);

//         // Add earn manager one as an earn manager and configure a 100 bps fee
//         const { proof: earnManagerOneProof } =
//             earnManagerMerkleTree.getInclusionProof(earnManagerOne.publicKey);
//         await configureEarnManager(
//             earnManagerOne,
//             new BN(100),
//             earnManagerOneProof
//         );

//         // Add non earner one as an earner under earn manager one
//         const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(
//             nonEarnerOne.publicKey
//         );
//         await addEarner(
//             earnManagerOne,
//             nonEarnerOne.publicKey,
//             proofs,
//             neighbors
//         );
//     });

//     test("Setting recipient_token_account when earn_manager is set - reverts", async () => {
//         const nonEarnerOneATA = await getATA(
//             mint.publicKey,
//             nonEarnerOne.publicKey
//         );

//         const randomRecipientATA = await getATA(
//             mint.publicKey,
//             new Keypair().publicKey
//         );

//         const earnerAccount = getEarnerAccount(nonEarnerOneATA);

//         // Attempt to add recipient account with earner that has a manager
//         await expectAnchorError(
//             earn.methods
//                 .setEarnerRecipient()
//                 .accounts({
//                     admin: admin.publicKey,
//                     earnerAccount,
//                     globalAccount: accounts.globalAccount,
//                     recipientTokenAccount: randomRecipientATA,
//                 })
//                 .signers([admin])
//                 .rpc(),
//             "InvalidAccount"
//         );

//         const state = await earn.account.earner.fetch(earnerAccount);
//         expect(state.recipientTokenAccount).toEqual(null);
//     })

//     test("Setting recipient_token_account with invalid token account - reverts", async () => {
//         const earnerOneATA = await getATA(
//             mint.publicKey,
//             earnerOne.publicKey
//         );

//         const dummyMint = new Keypair();
//         await createMint(dummyMint, nonAdmin)

//         const invalidATA = await getATA(
//             dummyMint.publicKey,
//             earnerOne.publicKey
//         );

//         const earnerAccount = getEarnerAccount(earnerOneATA);

//         // Attempt to add recipient account with the wrong mint
//         await expectAnchorError(
//             earn.methods
//                 .setEarnerRecipient()
//                 .accounts({
//                     admin: admin.publicKey,
//                     earnerAccount,
//                     globalAccount: accounts.globalAccount,
//                     recipientTokenAccount: invalidATA,
//                 })
//                 .signers([admin])
//                 .rpc(),
//             "ConstraintTokenMint"
//         );

//         const state = await earn.account.earner.fetch(earnerAccount);
//         expect(state.recipientTokenAccount).toEqual(null);
//     })

//     test("Setting recipient_token_account - success", async () => {
//         const earnerOneATA = await getATA(
//             mint.publicKey,
//             earnerOne.publicKey
//         );

//         const recipientATA = await getATA(
//             mint.publicKey,
//             yieldRecipient.publicKey
//         );

//         const earnerAccount = getEarnerAccount(earnerOneATA);
//         let state = await earn.account.earner.fetch(earnerAccount);
//         expect(state.recipientTokenAccount).toEqual(null);

//         await earn.methods
//             .setEarnerRecipient()
//             .accounts({
//                 admin: admin.publicKey,
//                 earnerAccount,
//                 globalAccount: accounts.globalAccount,
//                 recipientTokenAccount: recipientATA,
//             })
//             .signers([admin])
//             .rpc()

//         // Verify the account was set correctly
//         state = await earn.account.earner.fetch(earnerAccount);
//         expect(state.recipientTokenAccount).toEqual(recipientATA);
//     })

//     test("claim_for on recipient account - success", async () => {
//         // Update the index so there is outstanding yield
//         await propagateIndex(new BN(1_100_000_000_000));

//         // Setup the instruction
//         const { earnerAccount, earnerATA } = await prepClaimFor(
//             earnAuthority,
//             mint.publicKey,
//             earnerOne.publicKey
//         );

//         const recipientATA = await getATA(
//             mint.publicKey,
//             yieldRecipient.publicKey
//         );

//         // set recipient account
//         await earn.methods
//             .setEarnerRecipient()
//             .accounts({
//                 admin: admin.publicKey,
//                 earnerAccount,
//                 globalAccount: accounts.globalAccount,
//                 recipientTokenAccount: recipientATA,
//             })
//             .signers([admin])
//             .rpc()

//         // Verify the recipient is set
//         const state = await earn.account.earner.fetch(earnerAccount);
//         expect(state.recipientTokenAccount).toEqual(recipientATA);

//         // Verify the starting values
//         await expectTokenBalance(recipientATA, new BN(0));
//         await expectTokenBalance(earnerATA, new BN(0));

//         // Claim for the earner
//         await earn.methods
//             .claimFor(new BN(10_000_000))
//             .accounts({ ...accounts, userTokenAccount: recipientATA })
//             .signers([earnAuthority])
//             .rpc();

//         const currentTime = new BN(svm.getClock().unixTimestamp.toString());

//         // Verify the recipient token account was minted the correct amount
//         // and not the user's token account
//         await expectTokenBalance(recipientATA, new BN(1_000_000));
//         await expectTokenBalance(earnerATA, new BN(0));
//     })

//     test("claim_for on should be to recipient - revert", async () => {
//         // Update the index so there is outstanding yield
//         await propagateIndex(new BN(1_100_000_000_000));

//         // Setup the instruction
//         const { earnerAccount, earnerATA } = await prepClaimFor(
//             earnAuthority,
//             mint.publicKey,
//             earnerOne.publicKey
//         );

//         const recipientATA = await getATA(
//             mint.publicKey,
//             yieldRecipient.publicKey
//         );

//         // set recipient account
//         await earn.methods
//             .setEarnerRecipient()
//             .accounts({
//                 admin: admin.publicKey,
//                 earnerAccount,
//                 globalAccount: accounts.globalAccount,
//                 recipientTokenAccount: recipientATA,
//             })
//             .signers([admin])
//             .rpc()

//         // Verify the recipient is set
//         const state = await earn.account.earner.fetch(earnerAccount);
//         expect(state.recipientTokenAccount).toEqual(recipientATA);

//         await expectAnchorError(
//             earn.methods
//                 .claimFor(new BN(10_000_000))
//                 .accounts({ ...accounts })
//                 .signers([earnAuthority])
//                 .rpc(),
//             "ConstraintAddress"
//         );
//     })

//     test("Unsetting recipient_token_account - success", async () => {
//         const earnerOneATA = await getATA(
//             mint.publicKey,
//             earnerOne.publicKey
//         );

//         const recipientATA = await getATA(
//             mint.publicKey,
//             yieldRecipient.publicKey
//         );

//         const earnerAccount = getEarnerAccount(earnerOneATA);

//         // set recipient account
//         await earn.methods
//             .setEarnerRecipient()
//             .accounts({
//                 admin: admin.publicKey,
//                 earnerAccount,
//                 globalAccount: accounts.globalAccount,
//                 recipientTokenAccount: recipientATA,
//             })
//             .signers([admin])
//             .rpc()


//         let state = await earn.account.earner.fetch(earnerAccount);
//         expect(state.recipientTokenAccount).toEqual(recipientATA);

//         // unset recipient account
//         await earn.methods
//             .setEarnerRecipient()
//             .accounts({
//                 admin: admin.publicKey,
//                 earnerAccount,
//                 globalAccount: accounts.globalAccount,
//                 recipientTokenAccount: earn.programId,
//             })
//             .signers([admin])
//             .rpc()

//         // Verify the account was unset
//         state = await earn.account.earner.fetch(earnerAccount);
//         expect(state.recipientTokenAccount).toEqual(null);
//     })

//     test("Nonadmin setting recipient_token_account - revert", async () => {
//         const earnerOneATA = await getATA(
//             mint.publicKey,
//             earnerOne.publicKey
//         );

//         const randomATA = await getATA(
//             mint.publicKey,
//             new Keypair().publicKey
//         );

//         const earnerAccount = getEarnerAccount(earnerOneATA);

//         // Attempt to add recipient account with the wrong mint
//         await expectAnchorError(
//             earn.methods
//                 .setEarnerRecipient()
//                 .accounts({
//                     admin: nonAdmin.publicKey,
//                     earnerAccount,
//                     globalAccount: accounts.globalAccount,
//                     recipientTokenAccount: randomATA,
//                 })
//                 .signers([nonAdmin])
//                 .rpc(),
//             "NotAuthorized"
//         );

//         const state = await earn.account.earner.fetch(earnerAccount);
//         expect(state.recipientTokenAccount).toEqual(null);
//     })
// });
// });
