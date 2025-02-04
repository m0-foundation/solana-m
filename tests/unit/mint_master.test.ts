import { Program, AnchorError } from "@coral-xyz/anchor";
import { LiteSVM } from "litesvm";
import { fromWorkspace, LiteSVMProvider } from "anchor-litesvm";
import {
    PublicKey,
    Keypair,
    LAMPORTS_PER_SOL,
    SystemProgram,
    Transaction
} from "@solana/web3.js";
import { loadKeypair } from "../test-utils";
import { MintMaster } from "../../target/types/mint_master";
const MINT_MASTER_IDL = require("../../target/idl/mint_master.json");
import { 
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    createInitializeMintInstruction,
    createAssociatedTokenAccountInstruction,
    getAccount,
    getMint,
    getMintLen,
    getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import BN from "bn.js";

// Unit tests for mint master
// [ ] initialize
//   [ ] given the admin signs the transaction
//      [ ] the mint master account is created
//      [ ] the portal and distributor are set correctly
//   [ ] given a non-admin signs the transaction
//      [ ] the transaction reverts with an address constraint error
//
// [ ] mint_m
//   [ ] given the portal signs the transaction
//      [ ] tokens are minted to the destination account
//      [ ] the mint amount is correct
//   [ ] given the distributor signs the transaction
//      [ ] tokens are minted to the destination account
//      [ ] the mint amount is correct
//   [ ] given neither portal nor distributor signs
//      [ ] the transaction reverts with an invalid signer error
//
// [ ] set_mint_authority
//   [ ] given the mint master is the current authority
//      [ ] the mint authority is updated to the new authority
//   [ ] given the mint master is not the current authority
//      [ ] the transaction reverts with a not mint authority error
//
// [ ] set_distributor
//   [ ] given the admin signs the transaction
//      [ ] the distributor is updated
//   [ ] given a non-admin signs the transaction
//      [ ] the transaction reverts with an address constraint error
//
// [ ] set_portal
//   [ ] given the admin signs the transaction
//      [ ] the portal is updated
//   [ ] given a non-admin signs the transaction
//      [ ] the transaction reverts with an address constraint error

// Setup wallets once at the beginning of the test suite
const mint: Keypair = loadKeypair("test-addr/mint.json");
const admin: Keypair = loadKeypair("test-addr/admin.json");

const nonAdmin: Keypair = new Keypair();
const portal: Keypair = new Keypair();
const distributor: Keypair = new Keypair();

let svm: LiteSVM;
let provider: LiteSVMProvider;
let accounts: Record<string, PublicKey> = {};
let mintMaster: Program<MintMaster>;

// Utility functions for the tests
const expectAccountEmpty = (account: PublicKey) => {
	const accountInfo = svm.getAccount(account);

	if (accountInfo) {
		expect(accountInfo.lamports).toBe(0);
		expect(accountInfo.data.length).toBe(0);
		expect(accountInfo.owner).toStrictEqual(SystemProgram.programId);
	} 
	// If the accountInfo is null, then the account does not exist
};

const expectAnchorError = async (txResult: Promise<string>, errCode: string) => {
    let reverted = false;
    try {
        await txResult;
    } catch (e) {
        expect(e instanceof AnchorError).toBe(true);
        const err: AnchorError = e;
        expect(err.error.errorCode.code).toStrictEqual(errCode);
        reverted = true;
    } finally {
        expect(reverted).toBe(true);
    }
};

const expectMintMasterState = async (mintMasterAccount: PublicKey, portal: PublicKey, distributor: PublicKey) => {
    const state = await mintMaster.account.mintMaster.fetch(mintMasterAccount);
    expect(state.portal).toEqual(portal);
    expect(state.distributor).toEqual(distributor);
};

// instruction convenience functions
const prepInitialize = (signer: Keypair) => {
    // Find the mint master PDA
    const [mintMasterAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint-master")],
        mintMaster.programId
    );

    // Populate accounts for the instruction
    accounts.signer = signer.publicKey;
    accounts.mintMaster = mintMasterAccount;
    accounts.systemProgram = SystemProgram.programId;

    return { mintMasterAccount };
};

const initialize = async (portal: PublicKey, distributor: PublicKey) => {
    // Setup the instruction
    const { mintMasterAccount } = prepInitialize(admin);

    // Send the transaction
    await mintMaster.methods
        .initialize(portal, distributor)
        .accounts({ ...accounts })
        .signers([admin])
        .rpc();

    // Confirm the mint master account state
    await expectMintMasterState(mintMasterAccount, portal, distributor);

    return mintMasterAccount;
};

const getTokenBalance = async (tokenAccount: PublicKey) => {
    return (await getAccount(provider.connection, tokenAccount, null, TOKEN_2022_PROGRAM_ID)).amount;
};

const getMintAuthority = async (mint: PublicKey) => {
    return (await getMint(provider.connection, mint, null, TOKEN_2022_PROGRAM_ID)).mintAuthority;
}

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
        tokenAccount,    // ata
        owner,          // owner
        mint,           // mint
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    let tx = new Transaction().add(createATA);

    await provider.sendAndConfirm(
        tx,
        [admin]
    ); 

    return tokenAccount;
};

const createMint = async (mint: Keypair, mintAuthority: PublicKey) => {
    const mintLen = getMintLen([]);
    const mintLamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);
    const createMintAccount = SystemProgram.createAccount({
        fromPubkey: admin.publicKey,
        newAccountPubkey: mint.publicKey,
        space: mintLen,
        lamports: mintLamports,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeMint = createInitializeMintInstruction(
        mint.publicKey,
        6, // decimals
        mintAuthority, // mint authority
        null, // freeze authority
        TOKEN_2022_PROGRAM_ID
    );

    let tx = new Transaction(); 
    tx.add(createMintAccount, initializeMint);

    await provider.sendAndConfirm(
        tx,
        [admin, mint]
    );

    // Verify the mint was created properly
    const mintInfo = await provider.connection.getAccountInfo(mint.publicKey);
    if (!mintInfo) {
        throw new Error("Mint account was not created");
    }

    return mint.publicKey;
};

describe("MintMaster unit tests", () => {
    beforeEach(async () => {
        // Initialize the SVM instance with all necessary configurations
        svm = fromWorkspace("")
            .withSplPrograms()     // Add SPL programs (including token programs)
            .withBuiltins()        // Add builtin programs
            .withSysvars()         // Setup standard sysvars
            .withPrecompiles()     // Add standard precompiles
            .withBlockhashCheck(false); // Optional: disable blockhash checking for tests

        // Create an anchor provider from the liteSVM instance
        provider = new LiteSVMProvider(svm);

        // Create mint master anchor program instance
        mintMaster = new Program<MintMaster>(MINT_MASTER_IDL, provider);

        // Fund the wallets
        svm.airdrop(admin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
        svm.airdrop(nonAdmin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
        svm.airdrop(portal.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
        svm.airdrop(distributor.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

        // Clear the accounts object
        accounts = {};
    });

    describe("initialize unit tests", () => {
        // given the admin signs the transaction
        // the mint master account is created and the portal/distributor are set correctly
        test("Admin can initialize mint master", async () => {
            // Setup the instruction call
            const { mintMasterAccount } = prepInitialize(admin);
    
            // Create and send the transaction
            await mintMaster.methods
                .initialize(portal.publicKey, distributor.publicKey)
                .accounts({ ...accounts })
                .signers([admin])
                .rpc();
    
            // Verify the mint master state
            await expectMintMasterState(
                mintMasterAccount,
                portal.publicKey,
                distributor.publicKey
            );
        });
    
        // given a non-admin signs the transaction
        // the transaction reverts with an address constraint error
        test("Non-admin cannot initialize mint master", async () => {
            // Setup the instruction call
            prepInitialize(nonAdmin);
    
            // Attempt to initialize with non-admin signer
            await expectAnchorError(
                mintMaster.methods
                    .initialize(portal.publicKey, distributor.publicKey)
                    .accounts({ ...accounts })
                    .signers([nonAdmin])
                    .rpc(),
                "ConstraintAddress"
            );
        });
    
        // Additional test: Cannot initialize twice
        test("Cannot initialize mint master twice", async () => {
            // First initialization
            const { mintMasterAccount } = prepInitialize(admin);
            await mintMaster.methods
                .initialize(portal.publicKey, distributor.publicKey)
                .accounts({ ...accounts })
                .signers([admin])
                .rpc();
    
            // Verify first initialization
            await expectMintMasterState(
                mintMasterAccount,
                portal.publicKey,
                distributor.publicKey
            );
    
            // Attempt second initialization
            await expectAnchorError(
                mintMaster.methods
                    .initialize(portal.publicKey, distributor.publicKey)
                    .accounts({ ...accounts })
                    .signers([admin])
                    .rpc(),
                "AccountAlreadyInitialized"
            );
        });
    });

    describe("mint_m unit tests", () => {
        // Additional setup for token accounts
        const mintAmount = new BN(1_000_000); // 1 token with 6 decimals
        const user = new Keypair();
        let userTokenAccount: PublicKey;
        let mintMasterAccount: PublicKey;

        // Utility function to prepare mint_m instruction accounts
        const prepMintM = (signer: Keypair) => {
            // Populate accounts for the instruction
            accounts.signer = signer.publicKey;
            accounts.mintMaster = mintMasterAccount;
            accounts.mint = mint.publicKey;
            accounts.toTokenAccount = userTokenAccount;
            accounts.tokenProgram = TOKEN_2022_PROGRAM_ID;
        };

        // Setup token accounts before each test
        beforeEach(async () => {
            // Initialize mint master first
            mintMasterAccount = await initialize(portal.publicKey, distributor.publicKey);

            // Create and initialize mint with mint master as authority
            await createMint(mint, mintMasterAccount); 

            // Create user token account
            userTokenAccount = await createATA(mint.publicKey, user.publicKey);         
        });

        // given the portal signs the transaction
        // tokens are minted to the destination account
        // the mint amount is correct
        test("Portal can mint tokens", async () => {
            // Setup the instruction call
            prepMintM(portal);

            // Get initial token balance
            const initialBalance = await getTokenBalance(userTokenAccount); 

            // Create and send the transaction
            await mintMaster.methods
                .mintM(mintAmount)
                .accounts({ ...accounts })
                .signers([portal])
                .rpc();

            // Verify the tokens were minted correctly
            const finalBalance = await getTokenBalance(userTokenAccount);
            expect(finalBalance - initialBalance).toBe(BigInt(mintAmount.toString()));
        });

        // given the distributor signs the transaction
        // tokens are minted to the destination account
        // the mint amount is correct
        test("Distributor can mint tokens", async () => {
            // Setup the instruction call
            prepMintM(distributor);

            // Get initial token balance
            const initialBalance = await getTokenBalance(userTokenAccount);

            // Create and send the transaction
            await mintMaster.methods
                .mintM(mintAmount)
                .accounts({ ...accounts })
                .signers([distributor])
                .rpc();

            // Verify the tokens were minted correctly
            const finalBalance = await getTokenBalance(userTokenAccount);
            expect(finalBalance - initialBalance).toBe(BigInt(mintAmount.toString()));
        });

        // given neither portal nor distributor signs
        // the transaction reverts with an invalid signer error
        test("Non-authorized signer cannot mint tokens", async () => {
            // Setup the instruction call
            prepMintM(nonAdmin);

            // Attempt to mint with unauthorized signer
            await expectAnchorError(
                mintMaster.methods
                    .mintM(mintAmount)
                    .accounts({ ...accounts })
                    .signers([nonAdmin])
                    .rpc(),
                "InvalidSigner"
            );

            // Verify no tokens were minted
            const balance = await getTokenBalance(userTokenAccount);
            expect(balance).toBe(0n);
        });

        // Additional test: Cannot mint to an account with wrong mint
        test("Cannot mint to token account with wrong mint", async () => {
            // Create another mint and token account
            const wrongMint = new Keypair();

            await createMint(wrongMint, mintMasterAccount);

            const wrongTokenAccount = await createATA(
                wrongMint.publicKey,
                user.publicKey
            );

            // Setup the instruction call with wrong token account
            prepMintM(portal);
            accounts.toTokenAccount = wrongTokenAccount;

            // Attempt to mint to wrong token account
            await expectAnchorError(
                mintMaster.methods
                    .mintM(mintAmount)
                    .accounts({ ...accounts })
                    .signers([portal])
                    .rpc(),
                "ConstraintTokenMint"
            );
        });
    });

    describe("set_mint_authority unit tests", () => {
        let mintMasterAccount: PublicKey;
        let newAuthority: Keypair = new Keypair();

        // Utility function to prepare set_mint_authority instruction accounts
        const prepSetMintAuthority = (signer: PublicKey) => {
            // Populate accounts for the instruction
            accounts.mintMaster = mintMasterAccount;
            accounts.mint = mint.publicKey;
            accounts.tokenProgram = TOKEN_2022_PROGRAM_ID;
            accounts.signer = signer;
        };

        const setMintAuthority = async (newMintAuthority: PublicKey) => {
            // Setup the instruction
            prepSetMintAuthority(admin.publicKey);

            // Send the transaction
            await mintMaster.methods
                .setMintAuthority(newMintAuthority)
                .accounts({...accounts})
                .signers([admin])
                .rpc();

            // Confirm the mint authority has been changed
            const mintAuthority = await getMintAuthority(mint.publicKey);
            expect(mintAuthority).toStrictEqual(newMintAuthority);
        };

        beforeEach(async () => {
            // Initialize mint master first
            mintMasterAccount = await initialize(portal.publicKey, distributor.publicKey);

            // Create and initialize mint with mint master as authority
            await createMint(mint, mintMasterAccount); 
        });

        // given the mint master is the current authority
        // given the admin signs the transaction
        // the mint authority is updated to the new authority
        test("Admin can set new mint authority when mint master is current authority", async () => {
            // Setup the instruction call
            prepSetMintAuthority(admin.publicKey);

            // Set new mint authority
            await mintMaster.methods
                .setMintAuthority(newAuthority.publicKey)
                .accounts({ ...accounts })
                .signers([admin])
                .rpc();

            // Verify the mint authority was updated
            const mintAuthority = await getMintAuthority(mint.publicKey);
            expect(mintAuthority).toStrictEqual(newAuthority.publicKey);
        });
 
        // given the mint master is the current authority
        // given the admin does not sign the transaction
        // it reverts with an address constraint
        test("Non-admin can not set new mint authority when mint master is current authority", async () => {
            // Setup the instruction call
            prepSetMintAuthority(nonAdmin.publicKey);

            // Set new mint authority
            await expectAnchorError(
                mintMaster.methods
                    .setMintAuthority(newAuthority.publicKey)
                    .accounts({ ...accounts })
                    .signers([nonAdmin])
                    .rpc(),
                "ConstraintAddress"
            );

            // Verify the mint authority was updated
            const mintAuthority = await getMintAuthority(mint.publicKey);
            expect(mintAuthority).toStrictEqual(mintMasterAccount);
        });

        // given the mint master is not the current authority
        // the transaction reverts with a not mint authority error
        test("Cannot set mint authority when mint master is not current authority", async () => {
            // First set authority to someone else
            await setMintAuthority(newAuthority.publicKey);

            // Now try to set it again
            await expectAnchorError(
                mintMaster.methods
                    .setMintAuthority(admin.publicKey)
                    .accounts({ ...accounts })
                    .signers([admin])
                    .rpc(),
                "NotMintAuthority"
            );
        });
    });

    describe("set_distributor unit tests", () => {
        let mintMasterAccount: PublicKey;
        const newDistributor = new Keypair();

        // Utility function to prepare set_distributor instruction accounts
        const prepSetDistributor = (signer: Keypair) => {
            // Populate accounts for the instruction
            accounts.signer = signer.publicKey;
            accounts.mintMaster = mintMasterAccount;
        };

        beforeEach(async () => {
            // initialize the mint master account
            mintMasterAccount = await initialize(portal.publicKey, distributor.publicKey);
        });

        // given the admin signs the transaction
        // the distributor is updated
        test("Admin can set new distributor", async () => {
            // Setup the instruction call
            prepSetDistributor(admin);

            // Set new distributor
            await mintMaster.methods
                .setDistributor(newDistributor.publicKey)
                .accounts({ ...accounts })
                .signers([admin])
                .rpc();

            // Verify the distributor was updated
            await expectMintMasterState(
                mintMasterAccount,
                portal.publicKey,
                newDistributor.publicKey
            );
        });

        // given a non-admin signs the transaction
        // the transaction reverts with an address constraint error
        test("Non-admin cannot set distributor", async () => {
            // Setup the instruction call
            prepSetDistributor(nonAdmin);

            // Attempt to set new distributor
            await expectAnchorError(
                mintMaster.methods
                    .setDistributor(newDistributor.publicKey)
                    .accounts({ ...accounts })
                    .signers([nonAdmin])
                    .rpc(),
                "ConstraintAddress"
            );

            // Verify the distributor was not updated
            await expectMintMasterState(
                mintMasterAccount,
                portal.publicKey,
                distributor.publicKey
            );
        });
    });

    describe("set_portal unit tests", () => {
        let mintMasterAccount: PublicKey;
        const newPortal = new Keypair();

        // Utility function to prepare set_portal instruction accounts
        const prepSetPortal = (signer: Keypair) => {
            // Populate accounts for the instruction
            accounts.signer = signer.publicKey;
            accounts.mintMaster = mintMasterAccount;
        };

        beforeEach(async () => {        
            // initialize the mint master account
            mintMasterAccount = await initialize(portal.publicKey, distributor.publicKey);
        });

        // given the admin signs the transaction
        // the portal is updated
        test("Admin can set new portal", async () => {
            // Setup the instruction call
            prepSetPortal(admin);

            // Set new portal
            await mintMaster.methods
                .setPortal(newPortal.publicKey)
                .accounts({ ...accounts })
                .signers([admin])
                .rpc();

            // Verify the portal was updated
            await expectMintMasterState(
                mintMasterAccount,
                newPortal.publicKey,
                distributor.publicKey
            );
        });

        // given a non-admin signs the transaction
        // the transaction reverts with an address constraint error
        test("Non-admin cannot set portal", async () => {
            // Setup the instruction call
            prepSetPortal(nonAdmin);

            // Attempt to set new portal
            await expectAnchorError(
                mintMaster.methods
                    .setPortal(newPortal.publicKey)
                    .accounts({ ...accounts })
                    .signers([nonAdmin])
                    .rpc(),
                "ConstraintAddress"
            );

            // Verify the portal was not updated
            await expectMintMasterState(
                mintMasterAccount,
                portal.publicKey,
                distributor.publicKey
            );
        });
    });
});
