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
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getMintLen,
  getMinimumBalanceForRentExemptMultisig,
  getAssociatedTokenAddressSync,
  createInitializeMultisigInstruction,
  createMintToCheckedInstruction,
} from "@solana/spl-token";

import { MerkleTree, ProofElement } from "../merkle";
import { loadKeypair } from "../test-utils";

import { Earn } from "../../target/types/earn";
const EARN_IDL = require("../../target/idl/earn.json");

// Unit tests for earn program

// Setup wallets once at the beginning of the test suite
const admin: Keypair = loadKeypair("test-addr/admin.json");
const portal: Keypair = loadKeypair("test-addr/portal.json");
const mint: Keypair = loadKeypair("test-addr/mint.json");
const earnAuthority: Keypair = new Keypair();
const mintAuthority: Keypair = new Keypair();
const nonAdmin: Keypair = new Keypair();

// Create random addresses for testing
const earnerOne: Keypair = new Keypair();
const earnerTwo: Keypair = new Keypair();
const earnManagerOne: Keypair = new Keypair();
const earnManagerTwo: Keypair = new Keypair();
const nonEarnerOne: Keypair = new Keypair();
const nonEarnManagerOne: Keypair = new Keypair();

let svm: LiteSVM;
let provider: LiteSVMProvider;
let accounts: Record<string, PublicKey> = {};
let earn: Program<Earn>;

// Start parameters
const initialSupply = new BN(100_000_000); // 100 tokens with 6 decimals
const initialIndex = new BN(1_000_000_000_000); // 1.0
const claimCooldown = new BN(86_400) // 1 day

// Merkle trees
let earnerMerkleTree: MerkleTree;
let earnManagerMerkleTree: MerkleTree;

// Type definitions for accounts to make it easier to do comparisons

interface Global {
  earnAuthority?: PublicKey;
  index?: BN;
  timestamp?: BN;
  claimCooldown?: BN;
  maxSupply?: BN;
  maxYield?: BN;
  distributed?: BN;
  claimComplete?: boolean;
  earnerMerkleRoot?: number[];
  earnManagerMerkleRoot?: number[];
}

interface Earner {
  earnManager?: PublicKey;
  lastClaimIndex?: BN;
  isEarning: boolean;
}

interface EarnManager {
  isActive?: boolean;
  feeBps?: BN;
  feeTokenAccount?: PublicKey;
}

const getGlobalAccount = () => {
  const [globalAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    earn.programId
  );

  return globalAccount;
}

const getEarnerAccount = (ata: PublicKey) => {
  const [earnerAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("earner"), ata.toBuffer()],
    earn.programId
  );

  return earnerAccount;
};

const getEarnManagerAccount = (earnManager: PublicKey) => {
  const [earnManagerAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("earn-manager"), earnManager.toBuffer()],
    earn.programId
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

const expectSystemError = async (
  txResult: Promise<string>
) => {
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

const expectGlobalState = async (
  globalAccount: PublicKey,
  expected: Global
) => {
  const state = await earn.account.global.fetch(globalAccount);

  if (expected.earnAuthority) expect(state.earnAuthority).toEqual(expected.earnAuthority);
  if (expected.index) expect(state.index.toString()).toEqual(expected.index.toString());
  if (expected.timestamp) expect(state.timestamp.toString()).toEqual(expected.timestamp.toString());
  if (expected.claimCooldown) expect(state.claimCooldown.toString()).toEqual(expected.claimCooldown.toString());
  if (expected.maxSupply) expect(state.maxSupply.toString()).toEqual(expected.maxSupply.toString());
  if (expected.maxYield) expect(state.maxYield.toString()).toEqual(expected.maxYield.toString());
  if (expected.distributed) expect(state.distributed.toString()).toEqual(expected.distributed.toString());
  if (expected.claimComplete !== undefined) expect(state.claimComplete).toEqual(expected.claimComplete);
  if (expected.earnerMerkleRoot) expect(state.earnerMerkleRoot).toEqual(expected.earnerMerkleRoot);
  if (expected.earnManagerMerkleRoot) expect(state.earnManagerMerkleRoot).toEqual(expected.earnManagerMerkleRoot);
};

const expectEarnerState = async (
  earnerAccount: PublicKey,
  expected: Earner
) => {
  const state = await earn.account.earner.fetch(earnerAccount);

  if (expected.earnManager) expect(state.earnManager).toEqual(expected.earnManager);
  if (expected.lastClaimIndex) expect(state.lastClaimIndex.toString()).toEqual(expected.lastClaimIndex.toString());
  if (expected.isEarning) expect(state.isEarning).toEqual(expected.isEarning);
};

const expectEarnManagerState = async (
  earnManagerAccount: PublicKey,
  expected: EarnManager
) => {
  const state = await earn.account.earnManager.fetch(earnManagerAccount);

  if (expected.isActive !== undefined) expect(state.isActive).toEqual(expected.isActive);
  if (expected.feeBps) expect(state.feeBps.toString()).toEqual(expected.feeBps.toString());
  if (expected.feeTokenAccount) expect(state.feeTokenAccount).toEqual(expected.feeTokenAccount);
};

const getTokenBalance = async (tokenAccount: PublicKey) => {
  return (
    await getAccount(
      provider.connection,
      tokenAccount,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  ).amount;
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
}

const createMint = async (mint: Keypair, mintAuthority: Keypair) => {

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

  let tx = new Transaction();
  tx.add(createMintWithMultisigAccount, initializeMint);

  await provider.sendAndConfirm(tx, [admin, mint]);

  // Verify the mint was created properly
  const mintInfo = await provider.connection.getAccountInfo(mint.publicKey);
  if (!mintInfo) {
    throw new Error("Mint account was not created");
  }

  return mint.publicKey;
};

const createMintWithMultisig = async (mint: Keypair, mintAuthority: Keypair) => {
  // Create and initialize multisig mint authority on the token program
  const multisigLen = 355;
  // const multisigLamports = await provider.connection.getMinimumBalanceForRentExemption(multisigLen);
  const multisigLamports = await getMinimumBalanceForRentExemptMultisig(provider.connection);
  
  const createMultisigAccount = SystemProgram.createAccount({
    fromPubkey: admin.publicKey,
    newAccountPubkey: mintAuthority.publicKey,
    space: multisigLen,
    lamports: multisigLamports,
    programId: TOKEN_2022_PROGRAM_ID
  });

  const globalAccount = getGlobalAccount();

  const initializeMultisig = createInitializeMultisigInstruction(
    mintAuthority.publicKey, // account
    [portal, globalAccount],
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
  const toATA: PublicKey = await getATA(mint.publicKey, to);

  const mintToInstruction = createMintToCheckedInstruction(
    mint.publicKey,
    toATA,
    mintAuthority.publicKey,
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
  clock.unixTimestamp = increment ? clock.unixTimestamp + BigInt(seconds.toString()) : BigInt(seconds.toString());
  svm.setClock(clock);
};

const warpSlot = (slots: BN, increment: boolean) => {
  const clock = svm.getClock();
  clock.slot = increment ? clock.slot + BigInt(slots.toString()) : BigInt(slots.toString());
  svm.setClock(clock);
}

// instruction convenience functions
const prepInitialize = (signer: Keypair) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount();

  // Populate accounts for the instruction
  accounts = {};
  accounts.signer = signer.publicKey;
  accounts.globalAccount = globalAccount;
  accounts.systemProgram = SystemProgram.programId;

  return { globalAccount };
};

const initialize = async (
  earnAuthority: PublicKey,
  initialIndex: BN,
  claimCooldown: BN
) => {
  // Setup the instruction
  const { globalAccount } = prepInitialize(admin);

  // Send the transaction
  await earn.methods
    .initialize(earnAuthority, initialIndex, claimCooldown)
    .accounts({ ...accounts })
    .signers([admin])
    .rpc();

  // Confirm the global account state
  await expectGlobalState(
    globalAccount,
    { 
        earnAuthority,
        index: initialIndex,
        claimCooldown,
        claimComplete: true
    });

  return globalAccount;
};

const prepSetEarnAuthority = (signer: Keypair) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount();

  // Populate accounts for the instruction
  accounts = {};
  accounts.signer = signer.publicKey;
  accounts.globalAccount = globalAccount;

  return { globalAccount };
};

const setEarnAuthority = async (newEarnAuthority: PublicKey) => {
    // Setup the instruction call
    const { globalAccount } = prepSetEarnAuthority(admin);

    // Send the instruction
    await earn.methods
        .setEarnAuthority(newEarnAuthority)
        .accounts({...accounts})
        .signers([admin])
        .rpc();

    // Confirm the global state has been updated
    await expectGlobalState(
        globalAccount,
        {
            earnAuthority: newEarnAuthority
        }
    );
};

const prepPropagateIndex = (signer: Keypair) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount(); 

  // Populate accounts
  accounts = {};
  accounts.signer = signer.publicKey;
  accounts.globalAccount = globalAccount;
  accounts.mint = mint.publicKey;

  return { globalAccount };
};

const propagateIndex = async (
    newIndex: BN,
    earnerMerkleRoot: number[] = new Array(32).fill(0),
    earnManagerMerkleRoot: number[] = new Array(32).fill(0)
) => {
  // Setup the instruction
  const { globalAccount } = prepPropagateIndex(portal);

  // Send the instruction
  await earn.methods
    .propagateIndex(
        newIndex,
        earnerMerkleRoot,
        earnManagerMerkleRoot
    )
    .accounts({...accounts})
    .signers([portal])
    .rpc();

  // We don't check state here because it depends on the circumstances

  return { globalAccount };
};

const prepClaimFor = async (signer: Keypair, mint: PublicKey, earner: PublicKey, earnManager?: PublicKey) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount();

  // Get the earner ATA
  const earnerATA = await getATA(mint, earner);

  // Get the earner account
  const earnerAccount = getEarnerAccount(earnerATA);

  // Populate accounts
  accounts = {};
  accounts.signer = signer.publicKey;
  accounts.globalAccount = globalAccount;
  accounts.earnerAccount = earnerAccount;
  accounts.mint = mint;
  accounts.userTokenAccount = earnerATA;

  if (earnManager) {
    // Get the earn manager ATA
    const earnManagerATA = await getATA(mint, earnManager);

    // Get the earn manager account
    const earnManagerAccount = getEarnManagerAccount(earnManager);

    accounts.earnManagerAccount = earnManagerAccount;
    accounts.earnManagerTokenAccount = earnManagerATA;

    return { globalAccount, earnerAccount, earnerATA, earnManagerAccount, earnManagerATA };
  }
  
  return { globalAccount, earnerAccount, earnerATA };

};

const claimFor = async (snapshotBalance: BN, earner: PublicKey, earnManager?: PublicKey) => {
  // Setup the instruction
  await prepClaimFor(earnAuthority, mint.publicKey, earner, earnManager);

  // Send the instruction
  await earn.methods
    .claimFor(snapshotBalance)
    .accounts({...accounts})
    .signers([earnAuthority])
    .rpc();
};


const prepCompleteClaims = (signer: Keypair) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount(); 

  // Populate accounts
  accounts = {};
  accounts.signer = signer.publicKey;
  accounts.globalAccount = globalAccount;

  return { globalAccount }; 
};

const completeClaims = async () => {
  // Setup the instruction
  prepCompleteClaims(earnAuthority);

  // Send the instruction
  await earn.methods
    .completeClaims()
    .accounts({...accounts})
    .signers([earnAuthority])
    .rpc();
};

const prepConfigureEarnManager = (signer: Keypair, earnManager: PublicKey, feeTokenAccount: PublicKey) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount();

  // Get the earn manager PDA
  const earnManagerAccount = getEarnManagerAccount(earnManager);

  // Populate accounts
  accounts = {};
  accounts.signer = signer.publicKey;
  accounts.globalAccount = globalAccount;
  accounts.earnManagerAccount = earnManagerAccount;
  accounts.feeTokenAccount = feeTokenAccount;
  accounts.systemProgram = SystemProgram.programId;

  return { globalAccount, earnManagerAccount };
};

const configureEarnManager = async (earnManager: Keypair, feeBps: BN, proof: ProofElement[]) => {
  // Get the fee token account
  const feeTokenAccount = await getATA(mint.publicKey, earnManager.publicKey);

  // Setup the instruction
  prepConfigureEarnManager(earnManager, earnManager.publicKey, feeTokenAccount);

  // Send the instruction
  await earn.methods
    .configureEarnManager(feeBps, proof)
    .accounts({...accounts})
    .signers([earnManager])
    .rpc();
  
};

const prepAddEarner = (signer: Keypair, earnManager: PublicKey, earnerATA: PublicKey) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount();

  // Get the earn manager account
  const earnManagerAccount = getEarnManagerAccount(earnManager);

  // Get the earner account
  const earnerAccount = getEarnerAccount(earnerATA);

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

const addEarner = async (earnManager: Keypair, earner: PublicKey, proofs: ProofElement[][], neighbors: number[][]) => {
  // Get the earner ATA
  const earnerATA = await getATA(mint.publicKey, earner);

  // Setup the instruction
  prepAddEarner(earnManager, earnManager.publicKey, earnerATA);

  // Send the instruction
  await earn.methods
    .addEarner(earner, proofs, neighbors)
    .accounts({...accounts})
    .signers([earnManager])
    .rpc();
};

const prepRemoveEarner = (signer: Keypair, earnManager: PublicKey, earnerATA: PublicKey) => {
  // Get the earn manager account
  const earnManagerAccount = getEarnManagerAccount(earnManager);

  // Get the earner account
  const earnerAccount = getEarnerAccount(earnerATA);

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
  const earnerATA = await getATA(mint.publicKey, earner);

  // Setup the instruction
  prepRemoveEarner(earnManager, earnManager.publicKey, earnerATA);

  // Send the instruction
  await earn.methods
    .removeEarner(earner)
    .accounts({...accounts})
    .signers([earnManager])
    .rpc();
};

const prepAddRegistrarEarner = (signer: Keypair, earnerATA: PublicKey) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount();

  // Get the earner account
  const earnerAccount = getEarnerAccount(earnerATA);

  // Populate accounts
  accounts = {};
  accounts.signer = signer.publicKey;
  accounts.tokenAccount = earnerATA;
  accounts.globalAccount = globalAccount;
  accounts.earnerAccount = earnerAccount;
  accounts.systemProgram = SystemProgram.programId;

  return { globalAccount, earnerAccount };
};

const addRegistrarEarner = async (earner: PublicKey, proof: ProofElement[]) => {
  // Get the earner ATA
  const earnerATA = await getATA(mint.publicKey, earner);

  // Setup the instruction
  prepAddRegistrarEarner(nonAdmin, earnerATA);

  // Send the instruction
  await earn.methods
    .addRegistrarEarner(earner, proof)
    .accounts({...accounts})
    .signers([nonAdmin])
    .rpc();
};

const prepRemoveRegistrarEarner = (signer: Keypair, earnerATA: PublicKey) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount();

  // Get the earner account
  const earnerAccount = getEarnerAccount(earnerATA);

  // Populate accounts
  accounts = {};
  accounts.signer = signer.publicKey;
  accounts.globalAccount = globalAccount;
  accounts.userTokenAccount = earnerATA;
  accounts.earnerAccount = earnerAccount;

  return { globalAccount, earnerAccount };
};

const removeRegistrarEarner = async (earner: PublicKey, proofs: ProofElement[][], neighbors: number[][]) => {
  // Get the earner ATA
  const earnerATA = await getATA(mint.publicKey, earner);

  // Setup the instruction
  prepRemoveRegistrarEarner(nonAdmin, earnerATA);

  // Send the instruction
  await earn.methods
    .removeRegistrarEarner(earner, proofs, neighbors)
    .accounts({...accounts})
    .signers([nonAdmin])
    .rpc();
};

const prepRemoveEarnManager = (signer: Keypair, earnManager: PublicKey) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount();

  // Get the earn manager account
  const earnManagerAccount = getEarnManagerAccount(earnManager);

  // Populate accounts
  accounts = {};
  accounts.signer = signer.publicKey;
  accounts.globalAccount = globalAccount;
  accounts.earnManagerAccount = earnManagerAccount;

  return { globalAccount, earnManagerAccount };
};

const removeEarnManager = async (earnManager: PublicKey, proofs: ProofElement[][], neighbors: number[][]) => {
  // Setup the instruction
  prepRemoveEarnManager(nonAdmin, earnManager);

  // Send the instruction
  await earn.methods
    .removeEarnManager(earnManager, proofs, neighbors)
    .accounts({...accounts})
    .signers([nonAdmin])
    .rpc();
};

const prepRemoveOrphanedEarner = (signer: Keypair, earnerATA: PublicKey, earnManager?: PublicKey) => {
  // Get the earner account
  const earnerAccount = getEarnerAccount(earnerATA);


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

const removeOrphanedEarner = async (earner: PublicKey, earnManager?: PublicKey) => {
  // Get the earner ATA
  const earnerATA = await getATA(mint.publicKey, earner);

  // Setup the instruction
  prepRemoveOrphanedEarner(nonAdmin, earnerATA, earnManager);

  // Send the instruction
  await earn.methods
    .removeOrphanedEarner()
    .accounts({...accounts})
    .signers([nonAdmin])
    .rpc();
};

describe("Earn unit tests", () => {
  beforeEach(async () => {
    // Initialize the SVM instance with all necessary configurations
    svm = fromWorkspace("")
      .withSplPrograms()     // Add SPL programs (including token programs)
      .withBuiltins()        // Add builtin programs
      .withSysvars()         // Setup standard sysvars
      .withPrecompiles()     // Add standard precompiles
      .withBlockhashCheck(true); // Optional: disable blockhash checking for tests

    // Create an anchor provider from the liteSVM instance
    provider = new LiteSVMProvider(svm);

    // Create program instances
    earn = new Program<Earn>(EARN_IDL, EARN_IDL.metadata.address, provider);

    // Fund the wallets
    svm.airdrop(admin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(portal.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(earnAuthority.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(nonAdmin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(earnManagerOne.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(earnManagerTwo.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(nonEarnManagerOne.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

    // Create the token mint
    await createMintWithMultisig(mint, mintAuthority);

    // Mint some tokens to have a non-zero supply
    await mintM(admin.publicKey, initialSupply);
  });

  describe("initialize unit tests", () => {
    // test cases
    //   [X] given the admin signs the transaction
    //      [X] the global account is created
    //      [X] the earn authority is set correctly
    //      [X] the initial index is set correctly
    //      [X] the claim cooldown is set correctly
    //   [X] given a non-admin signs the transaction
    //      [X] the transaction reverts with an address constraint error


    // given the admin signs the transaction
    // the global account is created and configured correctly
    test("Admin can initialize earn program", async () => {
      // Setup the instruction call
      const { globalAccount } = prepInitialize(admin);

      // Create and send the transaction
      await earn.methods
        .initialize(
            earnAuthority.publicKey, 
            initialIndex, 
            claimCooldown
        )
        .accounts({ ...accounts })
        .signers([admin])
        .rpc();

      // Verify the global state including zero-initialized Merkle roots
      await expectGlobalState(
        globalAccount,
        {
            earnAuthority: earnAuthority.publicKey,
            index: initialIndex,
            claimCooldown,
            claimComplete: true,
            earnerMerkleRoot: new Array(32).fill(0),
            earnManagerMerkleRoot: new Array(32).fill(0)
        }
      );
    });

    // given a non-admin signs the transaction
    // the transaction reverts with an address constraint error
    test("Non-admin cannot initialize earn program", async () => {
      // Setup the instruction call
      prepInitialize(nonAdmin);

      // Attempt to initialize with non-admin signer
      await expectAnchorError(
        earn.methods
          .initialize(earnAuthority.publicKey, initialIndex, claimCooldown)
          .accounts({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        "ConstraintAddress"
      );
    });

  });

  describe("set_earn_authority unit tests", () => {
    // test cases
    //   [X] given the admin signs the transaction
    //      [X] the earn authority is updated
    //   [X] given a non-admin signs the transaction
    //      [X] the transaction reverts with an address constraint error

    beforeEach(async () => {
        // Initialize the program
        await initialize(
          earnAuthority.publicKey,
          initialIndex,
          claimCooldown
        );
    });

    test("Admin can set new earn authority", async () => {
      // Setup new earn authority
      const newEarnAuthority = new Keypair();

      // Setup the instruction
      const { globalAccount } = prepSetEarnAuthority(admin);

      // Send the transaction
      await earn.methods
        .setEarnAuthority(newEarnAuthority.publicKey)
        .accounts({...accounts})
        .signers([admin])
        .rpc();

      // Verify the global state was updated
      await expectGlobalState(globalAccount, {
        earnAuthority: newEarnAuthority.publicKey,
      });
    });

    test("Non-admin cannot set earn authority", async () => {
      // Attempt to set new earn authority with non-admin
      const newEarnAuthority = new Keypair();

      prepSetEarnAuthority(nonAdmin);
      
      await expectAnchorError(
        earn.methods
          .setEarnAuthority(newEarnAuthority.publicKey)
          .accounts({...accounts})
          .signers([nonAdmin])
          .rpc(),
        "ConstraintAddress"
      );
    });
  });

  describe("propagate_index unit tests", () => {

    // test cases
    // [X] given the portal does not sign the transaction
    //   [X] the transaction fails with a not authorized error
    // [X] given the portal does sign the transaction
    //   [ ] given the new index is less than the existing index
    //     [ ] given the new earner merkle root is empty
    //       [ ] it is not updated
    //     [ ] given the new earner merkle is not empty
    //       [ ] it is not updated
    //     [ ] given the new earn_manager merkle root is empty
    //       [ ] it is not updated
    //     [ ] given the new earn_manager merkle is not empty
    //       [ ] it is not updated
    //   [ ] given the new index is greater than or eqal to the existing index
    //     [ ] given the new earner merkle root is empty
    //       [ ] it is not updated
    //     [ ] given the new earner merkle is not empty
    //       [ ] it is updated
    //     [ ] given the new earn_manager merkle root is empty
    //       [ ] it is not updated
    //     [ ] given the new earn_manager merkle is not empty
    //       [ ] it is updated
    //   [X] given the last claim hasn't been completed
    //     [X] given the time is within the cooldown period
    //       [ ] given the new index is less than or equal to the existing index
    //         [X] given current supply is less than or equal to max supply
    //           [X] nothing is updated
    //         [X] given current supply is greater than max supply
    //           [X] max supply is updated to the current supply
    //       [ ] given the new index is greater the existing index
    //         [ ] given current supply is less than or equal to max supply
    //           [ ] nothing is updated
    //         [ ] given current supply is greater than max supply
    //           [ ] max supply is updated to the current supply

    //     [X] given the time is past the cooldown period
    //       [ ] given the new index is less than or equal to the existing index
    //         [X] given the current supply is less than or equal to max supply
    //           [X] nothing is updated
    //         [X] given the current supply is greater than max supply
    //           [X] max supply is updated to the current supply
    //       [ ] given the new index is greater the existing index
    //         [ ] given current supply is less than or equal to max supply
    //           [ ] nothing is updated
    //         [ ] given current supply is greater than max supply
    //           [ ] max supply is updated to the current supply
    //   [X] given the last claim has been completed
    //     [X] given the time is within the cooldown period
    //       [ ] given the new index is less than or equal to the existing index
    //         [X] given current supply is greater than max supply
    //           [X] max supply is updated to the current supply
    //         [X] given current supply is less than or equal to max supply
    //           [X] nothing is updated
    //       [ ] given the new index is greater the existing index
    //         [ ] given current supply is less than or equal to max supply
    //           [ ] nothing is updated
    //         [ ] given current supply is greater than max supply
    //           [ ] max supply is updated to the current supply
    //     [X] given the time is past the cooldown period
    //       [ ] given the new index is less than or equal to the existing index
    //         [ ] given current supply is less than or equal to max supply
    //           [ ] nothing is updated
    //         [ ] given current supply is greater than max supply
    //           [ ] max supply is updated to the current supply
    //       [ ] given the new index is greater the existing index
    //         [X] a new claim cycle starts:
    //           [X] index is updated to the provided value
    //           [X] timestamp is updated to the current timestamp
    //           [X] max supply is set to the current supply
    //           [X] distributed is set to 0
    //           [X] max yield is updated
    //           [X] claim complete is set to false


    beforeEach(async () => {
      // Initialize the program
      await initialize(
        earnAuthority.publicKey,
        initialIndex,
        claimCooldown
      );

      // Warp past the initial cooldown period
      warp(claimCooldown, true);
    });

    // given the portal signs the transaction
    // the transaction succeeds
    test("Portal can update index and Merkle roots", async () => {
      const newIndex = new BN(1_100_000_000_000); // 1.1
      const newEarnerRoot = Array(32).fill(1);
      const newManagerRoot = Array(32).fill(2);

      const { globalAccount } = prepPropagateIndex(portal);
      
      await earn.methods
        .propagateIndex(
            newIndex,
            newEarnerRoot,
            newManagerRoot
        )
        .accounts({...accounts})
        .signers([portal])
        .rpc();

      // Verify the global state was updated
      await expectGlobalState(
        globalAccount,
        {
          index: newIndex,
          earnerMerkleRoot: newEarnerRoot,
          earnManagerMerkleRoot: newManagerRoot
        }
      );
    });

    // given the portal does not sign the transaction
    // the transaction fails with a not authorized error
    test("Non-portal cannot update index", async () => {
      const newIndex = new BN(1_100_000_000_000);
      const newEarnerRoot = Array(32).fill(1);
      const newManagerRoot = Array(32).fill(2);

      prepPropagateIndex(nonAdmin);
      
      await expectAnchorError(
        earn.methods
          .propagateIndex(
              newIndex,
              newEarnerRoot,
              newManagerRoot
          )
          .accounts({...accounts})
          .signers([nonAdmin])
          .rpc(),
        "NotAuthorized"
      );
    });

    // given the last claim hasn't been completed
    // given the time is within the cooldown period
    // given current supply is less than or equal to max supply
    // nothing is updated
    test("propagate index - claim not complete, within cooldown period, supply <= max supply", async () => {
      // Update the index initially
      const newIndex = new BN(1_100_000_000_000);
      const newEarnerRoot = Array(32).fill(1);
      const newManagerRoot = Array(32).fill(2);
      const { globalAccount } = await propagateIndex(newIndex, newEarnerRoot, newManagerRoot);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());

      // Confirm that the index, timestamp, and Merkle roots are updated
      await expectGlobalState(
        globalAccount,
        {
          index: newIndex,
          timestamp: startTimestamp,
          maxSupply: initialSupply,
          earnerMerkleRoot: newEarnerRoot,
          earnManagerMerkleRoot: newManagerRoot
        }
      );

      // Propagate another new index immediately with different roots,
      // only the Merkle roots should be updated
      const newNewIndex = new BN(1_150_000_000_000);
      const newerEarnerRoot = Array(32).fill(3);
      const newerManagerRoot = Array(32).fill(4);

      await propagateIndex(newNewIndex, newerEarnerRoot, newerManagerRoot);

      // Check the state
      await expectGlobalState(
        globalAccount,
        {
          index: newIndex,
          timestamp: startTimestamp,
          maxSupply: initialSupply,
          earnerMerkleRoot: newerEarnerRoot,
          earnManagerMerkleRoot: newerManagerRoot
        }
      );
    });

    // given the last claim hasn't been completed
    // given the time is within the cooldown period
    // given current supply is greater than max supply
    // max supply is updated to the current supply
    test("propagate index - claim not complete, within cooldown period, supply > max supply", async () => {
      // Update the index initially
      const newIndex = new BN(1_100_000_000_000);
      const { globalAccount } = await propagateIndex(newIndex);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());

      // Mint more tokens to increase supply
      const additionalSupply = new BN(50_000_000);
      await mintM(admin.publicKey, additionalSupply);
      const newSupply = initialSupply.add(additionalSupply);

      // Try to propagate new index
      const newNewIndex = new BN(1_150_000_000);
      await propagateIndex(newNewIndex);

      // Check that only max supply was updated
      const clock = svm.getClock();
      await expectGlobalState(
        globalAccount,
        {
          index: newIndex,
          timestamp: startTimestamp,
          maxSupply: newSupply
        }
      );
    });

    // given the last claim has been completed
    // given the time is within the cooldown period
    // given current supply is greater than max supply
    // max supply is updated to the current supply
    test("propagate index - claim complete, within cooldown period, supply > max supply", async () => {
      // Update the index initially 
      const newIndex = new BN(1_100_000_000_000);
      const { globalAccount } = await propagateIndex(newIndex);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());

      // Set claim complete
      await completeClaims();

      // Mint more tokens
      const additionalSupply = new BN(50_000_000);
      await mintM(admin.publicKey, additionalSupply);
      const newSupply = initialSupply.add(additionalSupply);

      // Try to propagate new index
      const newNewIndex = new BN(1_150_000_000_000);
      await propagateIndex(newNewIndex);

      // Check that only max supply was updated
      await expectGlobalState(
        globalAccount,
        {
          index: newIndex,
          timestamp: startTimestamp, 
          maxSupply: newSupply,
          claimComplete: true
        }
      );
    });

    // given the last claim has been completed
    // given the time is within the cooldown period
    // given current supply is less than or equal to max supply
    // nothing is updated
    test("propagate index - claim complete, within cooldown period, supply <= max supply", async () => {
      // Update the index initially
      const newIndex = new BN(1_100_000_000_000);
      const { globalAccount } = await propagateIndex(newIndex);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());

      // Set claim complete
      await completeClaims();

      // Try to propagate new index
      const newNewIndex = new BN(1_150_000_000_000);
      await propagateIndex(newNewIndex);

      // Check that nothing was updated
      await expectGlobalState(
        globalAccount,
        {
          index: newIndex,
          timestamp: startTimestamp,
          maxSupply: initialSupply,
          claimComplete: true
        }
      );
    });

    // given the last claim hasn't been completed
    // given the time is past the cooldown period
    // given the current supply is greater than max supply
    // max supply is updated to the current supply
    test("propagate index - claim not complete, past cooldown period, supply > max supply", async () => {
      // Update the index initially
      const newIndex = new BN(1_100_000_000_000);
      const { globalAccount } = await propagateIndex(newIndex);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());

      // Warp past cooldown
      warp(claimCooldown.add(new BN(1)), true);

      // Mint more tokens
      const additionalSupply = new BN(50_000_000);
      await mintM(admin.publicKey, additionalSupply);
      const newSupply = initialSupply.add(additionalSupply);

      // Try to propagate new index
      const newNewIndex = new BN(1_150_000_000_000);
      await propagateIndex(newNewIndex);

      // Check that only max supply was updated
      await expectGlobalState(
        globalAccount,
        {
          index: newIndex,
          timestamp: startTimestamp,
          maxSupply: newSupply
        }
      );
    });

    // given the last claim hasn't been completed
    // given the time is past the cooldown period
    // given the current supply is less than or equal to max supply
    // nothing is updated
    test("propagate index - claim not complete, past cooldown period, supply <= max supply", async () => {
      // Update the index initially
      const newIndex = new BN(1_100_000_000_000);
      const { globalAccount } = await propagateIndex(newIndex);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());

      // Warp past cooldown
      warp(claimCooldown.add(new BN(1)), true);

      // Try to propagate new index
      const newNewIndex = new BN(1_150_000_000_000);
      await propagateIndex(newNewIndex);

      // Check that nothing was updated
      await expectGlobalState(
        globalAccount,
        {
          index: newIndex,
          timestamp: startTimestamp, 
          maxSupply: initialSupply
        }
      );
    });

    // given the last claim has been completed
    // given the time is past the cooldown period
    // a new claim cycle starts:
    // index is updated to the provided value
    // timestamp is updated to the current timestamp
    // max supply is set to the current supply
    // distributed is set to 0
    // rewards per token is updated
    // max yield is updated
    // claim complete is set to false
    test("propagate index - claim complete, past cooldown period, new cycle starts", async () => {
      // Update the index initially
      const newIndex = new BN(1_100_000_000_000);
      const { globalAccount } = await propagateIndex(newIndex);

      // Set claim complete
      await completeClaims();

      // Warp past cooldown
      warp(claimCooldown.add(new BN(1)), true);

      // Try to propagate new index
      const newNewIndex = new BN(1_150_000_000_000);
      try {
        await propagateIndex(newNewIndex);
      } catch (e) {
        console.log(e);
        expect(true).toBe(false);
      }

      // Calculate expected rewards per token and max yield
      const maxYield = initialSupply
        .mul(newNewIndex)
        .div(newIndex)
        .sub(initialSupply);

      // Check that new cycle started with all updates
      const clock = svm.getClock();
      await expectGlobalState(
        globalAccount,
        {
          index: newNewIndex,
          timestamp: new BN(clock.unixTimestamp.toString()),
          maxSupply: initialSupply,
          maxYield,
          distributed: new BN(0),
          claimComplete: false
        }
      );
    });
  });

  describe("claim_for unit tests", () => {
    // beforeEach(async () => {
    //   // Initialize the program
    //   await initialize(
    //     earnAuthority.publicKey,
    //     initialIndex,
    //     claimCooldown
    //   );

    //   // Warp past the initial cooldown period
    //   warp(claimCooldown, true);

    //   // Propagate a new index to start a new claim cycle
    //   await propagateIndex(new BN(1_100_000_000_000));
    // });

    // test cases
    // [ ] given the earn authority does not sign the transaction
    //   [ ] it reverts with an address constraint error
    // [ ] given the earn authority signs the transaction
    //   [ ] given the token mint is the wrong account
    //     [ ] it reverts with an address constraint error
    //   [ ] given the user token account is for the wrong token mint
    //     [ ] it reverts with an address constraint error
    //   [ ] given the user token account's earner account is not initialized
    //     [ ] it reverts with an account not initialized error
    //   [ ] given the earner's is_earning status is false
    //     [ ] it reverts with a NotEarning error
    //   [ ] given the earner's last claim index is the current index
    //     [ ] it reverts with an AlreadyClaimed error
    //   [ ] given the amonut to be minted causes the total distributed to exceed the max yield
    //     [ ] it reverts with am ExceedsMaxYield error
    //   [ ] given the earner doesn't have an earn manager
    //     [ ] the correct amount is minted to the earner's token account
    //   [ ] given the earner does have an earn manager 
    //     [ ] given no earn manager account is provided
    //       [ ] it reverts with a RequiredAccountMissing error
    //     [ ] given no earn manager token account is provided
    //       [ ] it reverts with a RequiredAccountMissing error
    //     [ ] given an earn manager token account is provided, but it doesn't match the fee recipient token account in the earn manager's configuration
    //       [ ] it reverts with an InvalidAccount error
    //     [ ] given the earn manager account and earn manager token account are provided correctly
    //       [ ] when the fee percent is zero
    //         [ ] the full amount is minted to the earner
    //       [ ] when the fee percent is not zero, but the actual fee rounds to zero
    //         [ ] the full amount is minted to the earner
    //       [ ] when the fee is non-zero
    //         [ ] the fee amount is minted to the earn manager token account
    //         [ ] the total rewards minus the fee is minted to the earner token account  
    
    // beforeEach(async () => {
    //   // Initialize the program
    //   await initialize(
    //     earnAuthority.publicKey,
    //     initialIndex,
    //     claimCooldown
    //   );

    //   // Warp past the initial cooldown period
    //   warp(claimCooldown, true);

    //   // Propagate a new index to start a new claim cycle
    //   await propagateIndex(new BN(1_100_000_000_000));
    // });

    // // given the earn authority doesn't sign the transaction
    // // it reverts with an address constraint error
    // test("Non-earn authority cannot claim", async () => {
    //   // Setup the instruction
    //   const { globalAccount } = prepClaimFor(nonAdmin);

    //   // Attempt to claim with non-earn authority
    //   await expectAnchorError(
    //     earn.methods
    //       .claimFor(new BN(100_000_000))
    //       .accounts({ ...accounts })
    //       .signers([nonAdmin])
    //       .rpc(),
    //     "ConstraintAddress"
    //   );
    // });

    





  });

  describe("complete_claims unit tests", () => {
    // test cases
    // [X] given the earn authority does not sign the transaction
    //   [X] it reverts with an address constraint error
    // [X] given the earn authority signs the transaction
    //   [X] given the most recent claim is complete
    //     [X] it reverts with a NoActiveClaim error
    //   [X] given the most recent claim is not complete
    //     [X] it sets the claim complete flag to true in the global account

    beforeEach(async () => {
      // Initialize the program
      await initialize(
        earnAuthority.publicKey,
        initialIndex,
        claimCooldown
      );

      // Warp past the initial cooldown period
      warp(claimCooldown, true);

      // Propagate a new index to start a new claim cycle
      await propagateIndex(new BN(1_100_000_000_000));
    });

    // given the earn authority does not sign the transaction
    // it reverts with an address constraint error
    test("Earn authority does not sign - reverts", async () => {
      // Setup the instruction
      prepCompleteClaims(nonAdmin);

      // Attempt to complete claim with non-earn authority
      await expectAnchorError(
        earn.methods
          .completeClaims()
          .accounts({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        "ConstraintAddress"
      );
    });

    // given the earn authority signs the transaction
    // given the most recent claim is complete
    // it reverts with a NoActiveClaim error
    test("Claim already complete - reverts", async () => {
      // Complete the active claim
      await completeClaims();

      // Expire the blockhash so the same txn can be sent again (in a new block)
      svm.expireBlockhash();

      // Setup the instruction
      prepCompleteClaims(earnAuthority);

      // Attempt to complete claim when already complete
      await expectAnchorError(
        earn.methods
          .completeClaims()
          .accounts({ ...accounts })
          .signers([earnAuthority])
          .rpc(),
        "NoActiveClaim"
      );

    });

    // given the earn authority signs the transaction
    // given the most recent claim is not complete
    // it sets the claim complete flag to true in the global account
    test("Complete claims - success", async () => {
      // Setup the instruction
      const { globalAccount } = prepCompleteClaims(earnAuthority);

      // Complete the claim
      await earn.methods
        .completeClaims()
        .accounts({ ...accounts })
        .signers([earnAuthority])
        .rpc();

      // Verify the global state was updated
      await expectGlobalState(
        globalAccount,
        {
          claimComplete: true
        }
      );
    });

  });

  describe("configure earn_manager unit tests", () => {
    // test cases
    // [X] given the earn manager account does not match the signer
    //   [X] it reverts with an address constraint error
    // [X] given the earn manager account matches the signer
    //   [X] given the provided merkle proof for the signer is invalid
    //     [X] it reverts with a InvalidProof error
    //   [X] given the provided merkle proof for the signer is valid
    //     [X] given the fee basis points is greater than 100_00 
    //       [X] it reverts with an InvalidParam error
    //     [X] given the fee basis points is less than or equal to 100_00
    //       [X] given the fee_token_account is for the wrong token mint
    //         [X] it reverts with an address constraint error
    //       [X] given the fee_token_account authority is not the signer
    //         [X] it reverts with an address constraint error
    //       [X] given the fee_token_account is for the correct token mint and the authority is the signer
    //         [X] given the earn manager account does not exist yet
    //           [X] it creates the earn manager account and the signer pays for it
    //           [X] it sets the earn manager is_active flag to true
    //           [X] it sets the fee_bps to the provided value
    //           [X] it sets the fee_token_account to the provided token account
    //         [X] given the earn manager account already exists
    //           [X] it updates the fee_bps to the provided value
    //           [X] it updates the fee_token_account to the provided token account

    beforeEach(async () => {
      // Initialize the program
      await initialize(
        earnAuthority.publicKey,
        initialIndex,
        claimCooldown
      );

      // Populate the earner merkle tree with the initial earners
      earnerMerkleTree = new MerkleTree([admin.publicKey, earnerOne.publicKey, earnerTwo.publicKey]);

      // Populate the earn manager merkle tree with the initial earn managers
      earnManagerMerkleTree = new MerkleTree([earnManagerOne.publicKey, earnManagerTwo.publicKey]);

      // Warp time forward past the initial cooldown period
      warp(claimCooldown, true);

      // Propagate a new index to start a new claim cycle and set the merkle roots
      await propagateIndex(new BN(1_100_000_000_000), earnerMerkleTree.getRoot(), earnManagerMerkleTree.getRoot());
    });

    // given the earn manager account does not match the signer
    // it reverts with a seeds constraint error
    test("Earn manager account does not match signer - reverts", async () => {
      // Get the ATA for earn manager one
      const earnManagerOneATA = await getATA(mint.publicKey, earnManagerOne.publicKey);

      // Get the inclusion proof for earn manager one in the earn manager tree
      const { proof } = earnManagerMerkleTree.getInclusionProof(earnManagerOne.publicKey);

      // Setup the instruction
      prepConfigureEarnManager(earnManagerOne, nonEarnManagerOne.publicKey, earnManagerOneATA);

      // Attempt to configure earn manager with non-matching account
      await expectAnchorError(
        earn.methods
          .configureEarnManager(new BN(100), proof)
          .accounts({ ...accounts })
          .signers([earnManagerOne])
          .rpc(),
        "ConstraintSeeds"
      );
    });

    // given the earn manager account matches the signer
    // given the provided merkle proof for the signer is invalid
    // it reverts with an InvalidProof error
    test("Invalid merkle proof - reverts", async () => {
      // Get the inclusion proof for earn manager one in the earn manager tree
      const { proof } = earnManagerMerkleTree.getInclusionProof(earnManagerOne.publicKey);

      // Get the ATA for non earn manager one
      const nonEarnManagerOneATA = await getATA(mint.publicKey, nonEarnManagerOne.publicKey);

      // Setup the instruction
      prepConfigureEarnManager(nonEarnManagerOne, nonEarnManagerOne.publicKey, nonEarnManagerOneATA);

      // Attempt to configure earn manager with invalid merkle proof
      await expectAnchorError(
        earn.methods
          .configureEarnManager(new BN(100), proof)
          .accounts({ ...accounts })
          .signers([nonEarnManagerOne])
          .rpc(),
        "InvalidProof"
      );
    });

    // given the earn manager account matches the signer
    // given the provided merkle proof for the signer is valid
    // given the fee basis points is greater than 100_00
    // it reverts with an InvalidParam error
    test("Fee basis points > 10000 - reverts", async () => {
      // Get the inclusion proof for earn manager one in the earn manager tree
      const { proof } = earnManagerMerkleTree.getInclusionProof(earnManagerOne.publicKey);

      // Get the ATA for earn manager one
      const earnManagerOneATA = await getATA(mint.publicKey, earnManagerOne.publicKey);

      // Setup the instruction
      prepConfigureEarnManager(earnManagerOne, earnManagerOne.publicKey, earnManagerOneATA);

      // Attempt to configure earn manager with invalid fee basis points
      await expectAnchorError(
        earn.methods
          .configureEarnManager(new BN(100_01), proof)
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
      await createMint(wrongMint, nonAdmin);

      // Get the ATA for earn manager one with the wrong mint
      const wrongATA = await getATA(wrongMint.publicKey, earnManagerOne.publicKey);

      // Get the inclusion proof for earn manager one in the earn manager tree
      const { proof } = earnManagerMerkleTree.getInclusionProof(earnManagerOne.publicKey);

      // Setup the instruction
      prepConfigureEarnManager(earnManagerOne, earnManagerOne.publicKey, wrongATA);

      // Attempt to configure earn manager with invalid fee token account
      await expectAnchorError(
        earn.methods
          .configureEarnManager(new BN(100), proof)
          .accounts({ ...accounts })
          .signers([earnManagerOne])
          .rpc(),
        "ConstraintTokenMint"
      );
    });

    // given the earn manager account matches the signer
    // given the provided merkle proof for the signer is valid
    // given the fee basis points is less than or equal to 100_00
    // given the fee_token_account authority is not the signer
    // it reverts with a constraint token owner error
    test("Fee token account authority not signer - reverts", async () => {
      // Get the ATA for earn manager one
      const nonEarnManagerOneATA = await getATA(mint.publicKey, nonEarnManagerOne.publicKey);

      // Get the inclusion proof for earn manager one in the earn manager tree
      const { proof } = earnManagerMerkleTree.getInclusionProof(earnManagerOne.publicKey);

      // Setup the instruction
      prepConfigureEarnManager(earnManagerOne, earnManagerOne.publicKey, nonEarnManagerOneATA);

      // Attempt to configure earn manager with invalid fee token account authority
      await expectAnchorError(
        earn.methods
          .configureEarnManager(new BN(100), proof)
          .accounts({ ...accounts })
          .signers([earnManagerOne])
          .rpc(),
        "ConstraintTokenOwner"
      );
    });

    // given the earn manager account matches the signer
    // given the provided merkle proof for the signer is valid
    // given the fee basis points is less than or equal to 100_00
    // given the fee_token_account is for the correct token mint and the authority is the signer
    // given the earn manager account does not exist yet
    // it creates the earn manager account and the signer pays for it
    // it sets the earn manager is_active flag to true
    // it sets the fee_bps to the provided value
    // it sets the fee_token_account to the provided token account
    test("Earn manager account does not exist - success", async () => {
      // Get the ATA for earn manager one
      const earnManagerOneATA = await getATA(mint.publicKey, earnManagerOne.publicKey);

      // Get the inclusion proof for earn manager one in the earn manager tree
      const { proof } = earnManagerMerkleTree.getInclusionProof(earnManagerOne.publicKey);

      // Setup the instruction
      const { earnManagerAccount } = prepConfigureEarnManager(earnManagerOne, earnManagerOne.publicKey, earnManagerOneATA);

      // Confirm the earn manager account is currently empty
      expectAccountEmpty(earnManagerAccount);

      // Send the instruction
      await earn.methods
        .configureEarnManager(new BN(100), proof)
        .accounts({ ...accounts })
        .signers([earnManagerOne])
        .rpc();

      // Verify the earn manager account is created and updated
      await expectEarnManagerState(
        earnManagerAccount,
        {
          isActive: true,
          feeBps: new BN(100),
          feeTokenAccount: earnManagerOneATA
        }
      );
    });

    // given the earn manager account matches the signer
    // given the provided merkle proof for the signer is valid
    // given the fee basis points is less than or equal to 100_00
    // given the fee_token_account is for the correct token mint and the authority is the signer
    // given the earn manager account already exists
    // it updates the fee_bps to the provided value
    // it updates the fee_token_account to the provided token account
    test("Earn manager account exists - success", async () => {
      // Get the inclusion proof for earn manager one in the earn manager tree
      const { proof } = earnManagerMerkleTree.getInclusionProof(earnManagerOne.publicKey);
      
      // Setup the earn manager account the first time
      await configureEarnManager(earnManagerOne, new BN(100), proof);

      // Expire the blockhash so the same txn can be sent again (in a new block)
      svm.expireBlockhash();

      // Get the ATA for earn manager one
      const earnManagerOneATA = await getATA(mint.publicKey, earnManagerOne.publicKey);

      // Setup the instruction
      const { earnManagerAccount } = prepConfigureEarnManager(earnManagerOne, earnManagerOne.publicKey, earnManagerOneATA);

      // Confirm the earn manager account has already been created
      await expectEarnManagerState(
        earnManagerAccount,
        {
          isActive: true,
          feeBps: new BN(100),
          feeTokenAccount: earnManagerOneATA
        }
      );

      // Send the instruction
      await earn.methods
        .configureEarnManager(new BN(101), proof)
        .accounts({ ...accounts })
        .signers([earnManagerOne])
        .rpc();

      // Verify the earn manager account is created and updated
      await expectEarnManagerState(
        earnManagerAccount,
        {
          isActive: true,
          feeBps: new BN(101),
          feeTokenAccount: earnManagerOneATA // TODO create another token account for the earn manager to test this
        }
      );
    });
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
    //       [X] given merkle proof for user exclusion from earner list is invalid
    //         [X] it reverts with an InvalidProof error
    //       [X] given merkle proof for user exclusion from earner list is valid
    //         [X] given user token account is for the wrong token mint
    //           [X] it reverts with an address constraint error
    //         [X] given user token account authority does not match the user pubkey
    //           [X] it reverts with an address constraint error
    //         [X] given the user token account is for the correct token mint and the authority is the user pubkey
    //           [X] it creates the earner account
    //           [X] it sets the earner is_active flag to true
    //           [X] it sets the earn_manager to the provided earn manager pubkey
    //           [X] it sets the last_claim_index to the current index

    beforeEach(async () => {
      // Initialize the program
      await initialize(
        earnAuthority.publicKey,
        initialIndex,
        claimCooldown
      );

      // Populate the earner merkle tree with the initial earners
      earnerMerkleTree = new MerkleTree([admin.publicKey, earnerOne.publicKey, earnerTwo.publicKey]);

      // Populate the earn manager merkle tree with the initial earn managers
      earnManagerMerkleTree = new MerkleTree([earnManagerOne.publicKey, earnManagerTwo.publicKey]);

      // Warp time forward past the initial cooldown period
      warp(claimCooldown, true);

      // Propagate a new index to start a new claim cycle and set the merkle roots
      await propagateIndex(new BN(1_100_000_000_000), earnerMerkleTree.getRoot(), earnManagerMerkleTree.getRoot());

      // Get inclusion proof for earn manager one in the earn manager tree
      const { proof: earnManagerOneProof } = earnManagerMerkleTree.getInclusionProof(earnManagerOne.publicKey);

      // Initialize earn manager one's account
      await configureEarnManager(earnManagerOne, new BN(100), earnManagerOneProof);
    });

    // given signer does not have an earn manager account initialized
    // it reverts with an account not initialized error
    test("Signer earn manager account not initialized - reverts", async () => {
      // Get the ATA for non earner one
      const nonEarnerOneATA = await getATA(mint.publicKey, nonEarnerOne.publicKey);

      // Setup the instruction
      prepAddEarner(nonEarnManagerOne, nonEarnManagerOne.publicKey, nonEarnerOneATA);

      // Get the exclusion proof for the earner against the earner merkle tree
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(nonEarnerOne.publicKey);

      // Attempt to add earner without an initialized earn manager account
      await expectAnchorError(
        earn.methods
          .addEarner(nonEarnerOne.publicKey, proofs, neighbors)
          .accounts({ ...accounts })
          .signers([nonEarnManagerOne])
          .rpc(),
        "AccountNotInitialized"
      );
    });

    // given signer has an earn manager account initialized
    // given earn manager account is not active
    // it reverts with a NotAuthorized error
    test("Signer's earn manager account not active - reverts", async () => {
      // Get the ATA for non earner one
      const nonEarnerOneATA = await getATA(mint.publicKey, nonEarnerOne.publicKey); 

      // Remove earn manager one from the earn manager merkle tree
      earnManagerMerkleTree.removeLeaf(earnManagerOne.publicKey);

      // Update the earn manager merkle root on the global account
      await propagateIndex(new BN(1_110_000_000_000), new Array(32).fill(0), earnManagerMerkleTree.getRoot());
      
      // Get the exclusion proof for earn manager one against the earn manager merkle tree
      const { proofs: earnManagerOneProofs, neighbors: earnManagerOneNeighbors } = earnManagerMerkleTree.getExclusionProof(earnManagerOne.publicKey);

      // Remove the earn manager account (set it to inactive)
      await removeEarnManager(earnManagerOne.publicKey, earnManagerOneProofs, earnManagerOneNeighbors);

      // Get the exclusion proof for the earner against the earner merkle tree
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(nonEarnerOne.publicKey);

      // Setup the instruction
      prepAddEarner(earnManagerOne, earnManagerOne.publicKey, nonEarnerOneATA);

      // Attempt to add earner with an inactive earn manager account
      await expectAnchorError(
        earn.methods
          .addEarner(nonEarnerOne.publicKey, proofs, neighbors)
          .accounts({ ...accounts })
          .signers([earnManagerOne])
          .rpc(),
        "NotAuthorized"
      );
    });


    // given signer has an earn manager account initialized
    // given earn manager account is active
    // given earner already has an earner account
    // it reverts with an account already initialized error
    test("Earner account already initialized - reverts", async () => {
      // Get the inclusion proof for earner one against the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

      // Add the earner via the registrar
      await addRegistrarEarner(earnerOne.publicKey, proof);

      // Get the ATA for earner one
      const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

      // Setup the instruction
      prepAddEarner(earnManagerOne, earnManagerOne.publicKey, earnerOneATA);

      // Attempt to add earner with an already initialized earner account
      await expectSystemError(
        earn.methods
          .addEarner(earnerOne.publicKey, [], [])
          .accounts({ ...accounts })
          .signers([earnManagerOne])
          .rpc()
      );
    });

    // given signer has an earn manager account initialized
    // given earn manager account is active
    // given the earner does not already have an earner account
    // given merkle proof for user exclusion from earner list is invalid
    // it reverts with an AlreadyEarns error
    test("Invalid merkle proof for user exclusion - reverts", async () => {
      // Get the ATA for earner one
      const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

      // Get the exclusion proof for a different key against the earner merkle tree
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(nonAdmin.publicKey);

      // Setup the instruction
      prepAddEarner(earnManagerOne, earnManagerOne.publicKey, earnerOneATA);

      // Attempt to add earner with invalid merkle proof
      await expectAnchorError(
        earn.methods
          .addEarner(earnerOne.publicKey, proofs, neighbors)
          .accounts({ ...accounts })
          .signers([earnManagerOne])
          .rpc(),
        "InvalidProof" 
      );
    });

    // given signer has an earn manager account initialized
    // given earn manager account is active
    // given the earner does not already have an earner account
    // given merkle proof for user exclusion from earner list is valid
    // given user token account is for the wrong token mint
    // it reverts with an token mint constraint error
    test("User token account is for the wrong token mint - reverts", async () => {
      // Create a new mint for the user token account
      const wrongMint = new Keypair();
      await createMint(wrongMint, nonAdmin);

      // Get the ATA for earner one
      const nonEarnerOneATA = await getATA(wrongMint.publicKey, nonEarnerOne.publicKey);

      // Get the exclusion proof for the earner against the earner merkle tree
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(nonEarnerOne.publicKey);

      // Setup the instruction
      prepAddEarner(earnManagerOne, earnManagerOne.publicKey, nonEarnerOneATA);

      // Attempt to add earner with user token account for wrong token mint
      await expectAnchorError(
        earn.methods
          .addEarner(nonEarnerOne.publicKey, proofs, neighbors)
          .accounts({ ...accounts })
          .signers([earnManagerOne])
          .rpc(),
        "ConstraintTokenMint"
      );
    });

    // given signer has an earn manager account initialized
    // given earn manager account is active
    // given the earner does not already have an earner account
    // given merkle proof for user exclusion from earner list is valid
    // given user token account authority does not match the user pubkey
    // it reverts with an address constraint error
    test("User token account authority does not match user pubkey - reverts", async () => {
      // Get the ATA for random user (not the same as the user)
      const randomATA = await getATA(mint.publicKey, nonAdmin.publicKey);

      // Get the exclusion proof for the earner against the earner merkle tree
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(nonEarnerOne.publicKey);

      // Setup the instruction
      prepAddEarner(earnManagerOne, earnManagerOne.publicKey, randomATA);

      // Attempt to add earner with user token account for wrong token mint
      await expectAnchorError(
        earn.methods
          .addEarner(nonEarnerOne.publicKey, proofs, neighbors)
          .accounts({ ...accounts })
          .signers([earnManagerOne])
          .rpc(),
        "ConstraintTokenOwner"
      );
    });

    // given signer has an earn manager account initialized
    // given earn manager account is active
    // given the earner does not already have an earner account
    // given merkle proof for user exclusion from earner list is valid
    // given user token account is for the correct token mint and the authority is the signer
    // it creates the earner account
    // it sets the earner is_active flag to true
    // it sets the earn_manager to the provided earn manager pubkey
    // it sets the last_claim_index to the current index
    test("Add non-registrar earner - success", async () => {
      // Get the ATA for non earner one
      const nonEarnerOneATA = await getATA(mint.publicKey, nonEarnerOne.publicKey);

      // Get the exclusion proof for the earner against the earner merkle tree
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(nonEarnerOne.publicKey);

      // Setup the instruction
      const { earnerAccount } = prepAddEarner(earnManagerOne, earnManagerOne.publicKey, nonEarnerOneATA);

      // Add earner one to the earn manager's list
      await earn.methods
        .addEarner(nonEarnerOne.publicKey, proofs, neighbors)
        .accounts({ ...accounts })
        .signers([earnManagerOne])
        .rpc();

      // Verify the earner account was initialized correctly
      await expectEarnerState(
        earnerAccount,
        {
          isEarning: true,
          earnManager: earnManagerOne.publicKey,
          lastClaimIndex: new BN(1_100_000_000_000)
        }
      );
    });
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

    beforeEach(async () => {
      // Initialize the program
      await initialize(
        earnAuthority.publicKey,
        initialIndex,
        claimCooldown
      );

      // Populate the earner merkle tree with the initial earners
      earnerMerkleTree = new MerkleTree([admin.publicKey, earnerOne.publicKey, earnerTwo.publicKey]);

      // Populate the earn manager merkle tree with the initial earn managers
      earnManagerMerkleTree = new MerkleTree([earnManagerOne.publicKey, earnManagerTwo.publicKey]);

      // Warp time forward past the initial cooldown period
      warp(claimCooldown, true);

      // Propagate a new index to start a new claim cycle and set the merkle roots
      await propagateIndex(new BN(1_100_000_000_000), earnerMerkleTree.getRoot(), earnManagerMerkleTree.getRoot());

      // Get inclusion proof for earn manager one in the earn manager tree
      const { proof: earnManagerOneProof } = earnManagerMerkleTree.getInclusionProof(earnManagerOne.publicKey);

      // Initialize earn manager one's account
      await configureEarnManager(earnManagerOne, new BN(100), earnManagerOneProof);

      // Get the exclusion proof for the earner against the earner merkle tree
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(nonEarnerOne.publicKey);

      // Add non earner one as an earner under earn manager one
      await addEarner(earnManagerOne, nonEarnerOne.publicKey, proofs, neighbors);
    });

    // given signer does not have an earn manager account initialized
    // it reverts with an account not initialized error
    test("Signer earn manager account not initialized - reverts", async () => {
      // Get the ATA for non earner one
      const nonEarnerOneATA = await getATA(mint.publicKey, nonEarnerOne.publicKey);

      // Setup the instruction
      prepRemoveEarner(nonEarnManagerOne, nonEarnManagerOne.publicKey, nonEarnerOneATA);

      // Attempt to remove earner without an initialized earn manager account
      await expectAnchorError(
        earn.methods
          .removeEarner(nonEarnerOne.publicKey)
          .accounts({ ...accounts })
          .signers([nonEarnManagerOne])
          .rpc(),
        "AccountNotInitialized"
      );
    });

    // given signer has an earn manager account initialized
    // given earn manager account is not active
    // it reverts with a NotAuthorized error
    test("Signer's earn manager account not active - reverts", async () => {
      // Get the ATA for non earner one
      const nonEarnerOneATA = await getATA(mint.publicKey, nonEarnerOne.publicKey);

      // Remove earn manager one from the earn manager merkle tree
      earnManagerMerkleTree.removeLeaf(earnManagerOne.publicKey);

      // Update the earn manager merkle root on the global account
      await propagateIndex(new BN(1_110_000_000_000), new Array(32).fill(0), earnManagerMerkleTree.getRoot());

      // Get exclusion proof for earn manager one in the earn manager tree
      const { proofs, neighbors } = earnManagerMerkleTree.getExclusionProof(earnManagerOne.publicKey);

      // Remove the earn manager account (set it to inactive)
      await removeEarnManager(earnManagerOne.publicKey, proofs, neighbors);

      // Setup the instruction
      prepRemoveEarner(earnManagerOne, earnManagerOne.publicKey, nonEarnerOneATA);

      // Attempt to remove earner with an inactive earn manager account
      await expectAnchorError(
        earn.methods
          .removeEarner(nonEarnerOne.publicKey)
          .accounts({ ...accounts })
          .signers([earnManagerOne])
          .rpc(),
        "NotAuthorized"
      );
    });

    // given signer has an earn manager account initialized
    // given earn manager account is active
    // given the earner account does not have an earn manager
    // it reverts with a NotAuthorized error
    test("Earner account does not have an earn manager - reverts", async () => {
      // Get the inclusion proof for earner one in the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

      // Add the earner via the registrar
      await addRegistrarEarner(earnerOne.publicKey, proof);

      // Get the ATA for earner one
      const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

      // Setup the instruction
      prepRemoveEarner(earnManagerOne, earnManagerOne.publicKey, earnerOneATA);

      // Attempt to remove earner without an earn manager
      await expectAnchorError(
        earn.methods
          .removeEarner(earnerOne.publicKey)
          .accounts({ ...accounts })
          .signers([earnManagerOne])
          .rpc(),
        "NotAuthorized"
      );
    });

    // given signer has an earn manager account initialized
    // given earn manager account is active
    // given the earner account has an earn manager
    // given the earner's earn manager is not the signer
    // it reverts with a NotAuthorized error
    test("Earner's earn manager is not signer - reverts", async () => {
      // Get the inclusion proof for earn manager two
      const { proof } = earnManagerMerkleTree.getInclusionProof(earnManagerTwo.publicKey);

      // Configure earn manager two's account (and create it)
      await configureEarnManager(earnManagerTwo, new BN(100), proof);

      // Get the ATA for non earner one
      const nonEarnerOneATA = await getATA(mint.publicKey, nonEarnerOne.publicKey);

      // Setup the instruction
      prepRemoveEarner(earnManagerTwo, earnManagerTwo.publicKey, nonEarnerOneATA);

      // Attempt to remove earner with the wrong earn manager
      await expectAnchorError(
        earn.methods
          .removeEarner(nonEarnerOne.publicKey)
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
      // Get the ATA for non earner one
      const nonEarnerOneATA = await getATA(mint.publicKey, nonEarnerOne.publicKey);

      // Setup the instruction
      const { earnerAccount } = prepRemoveEarner(earnManagerOne, earnManagerOne.publicKey, nonEarnerOneATA);

      // Remove the earner account
        await earn.methods
          .removeEarner(nonEarnerOne.publicKey)
          .accounts({ ...accounts })
          .signers([earnManagerOne])
          .rpc();

      // Verify the earner account was closed
      expectAccountEmpty(earnerAccount);
    });

  });

  describe("add_register_earner unit tests", () => {    
    // test cases
    // [X] given the user token account is for the wrong token mint
    //   [X] it reverts with a constraint token mint error
    // [X] given the user token account is not for the user pubkey
    //   [X] it reverts with a constraint token owner error
    // [X] given the user token account is not initialized
    //   [X] it reverts with an account not initialized error
    // [X] given the earner account is already initialized
    //   [X] it reverts with an account already initialized error
    // [X] given all the accounts are valid
    //   [X] given the merkle proof for the user in the earner list is invalid
    //     [X] it reverts with an InvalidProof error
    //   [X] given the merkle proof for the user in the earner list is valid
    //     [X] it creates the earner account
    //     [X] it sets the earner account's is_earning flag to true
    //     [X] it sets the earner account's earn_manager to None
    //     [X] it sets the earner account's last_claim_index to the current index

    beforeEach(async () => {
      // Initialize the program
      await initialize(
        earnAuthority.publicKey,
        initialIndex,
        claimCooldown
      );

      // Populate the earner merkle tree with the initial earners
      earnerMerkleTree = new MerkleTree([admin.publicKey, earnerOne.publicKey, earnerTwo.publicKey]);

      // Populate the earn manager merkle tree with the initial earn managers
      earnManagerMerkleTree = new MerkleTree([earnManagerOne.publicKey, earnManagerTwo.publicKey]);

      // Warp time forward past the initial cooldown period
      warp(claimCooldown, true);

      // Propagate a new index to start a new claim cycle and set the merkle roots
      await propagateIndex(new BN(1_100_000_000_000), earnerMerkleTree.getRoot(), earnManagerMerkleTree.getRoot());
    });

    // given the user token account is for the wrong token mint
    // it reverts with a constraint token mint error
    test("User token account is for the wrong token mint - reverts", async () => {
      // Create a new token mint
      const wrongMint = new Keypair();
      await createMint(wrongMint, nonAdmin);

      // Get earner one ATA for the wrong mint
      const wrongATA = await getATA(wrongMint.publicKey, earnerOne.publicKey);

      // Get the inclusion proof for earner one in the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

      // Setup the instruction
      prepAddRegistrarEarner(nonAdmin, wrongATA);

      // Attempt to add earner with wrong token mint
      await expectAnchorError(
        earn.methods
          .addRegistrarEarner(earnerOne.publicKey, proof)
          .accounts({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        "ConstraintTokenMint"
      );
    });

    // given the user token account is not owned by the user pubkey
    // it reverts with a constraint token owner error
    test("User token account authority does not match user pubkey - reverts", async () => {
      // Get the ATA for a random user
      const randomATA = await getATA(mint.publicKey, nonAdmin.publicKey);

      // Get the inclusion proof for earner one in the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

      // Setup the instruction
      prepAddRegistrarEarner(nonAdmin, randomATA);

      // Attempt to add earner with wrong token owner
      await expectAnchorError(
        earn.methods
          .addRegistrarEarner(earnerOne.publicKey, proof)
          .accounts({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        "ConstraintTokenOwner"
      );
    });

    // given the user token account is not initialized
    // it reverts with an account not initialized error
    test("User token account is not initialized - reverts", async () => {
      // Calculate the ATA for earner one, but don't create it
      const nonInitATA = getAssociatedTokenAddressSync(
        mint.publicKey,
        earnerOne.publicKey,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Get the inclusion proof for earner one in the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

      // Setup the instruction
      prepAddRegistrarEarner(nonAdmin, nonInitATA);

      // Attempt to add earner with uninitialized token account
      await expectAnchorError(
        earn.methods
          .addRegistrarEarner(earnerOne.publicKey, proof)
          .accounts({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        "AccountNotInitialized"
      );
    });

    // given the earner account is already initialized
    // it reverts with an account already initialized error
    test("Earner account already initialized - reverts", async () => {
      // Get the ATA for earner one
      const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

      // Get the inclusion proof for earner one in the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

      // Add earner one to the earn manager's list
      await addRegistrarEarner(earnerOne.publicKey, proof);

      // Setup the instruction
      prepAddRegistrarEarner(nonAdmin, earnerOneATA);

      // Attempt to add earner with already initialized account
      await expectSystemError(
        earn.methods
          .addRegistrarEarner(earnerOne.publicKey, proof)
          .accounts({ ...accounts })
          .signers([nonAdmin])
          .rpc()
      );
    });

    // given all the accounts are valid
    // given the merkle proof for the user in the earner list is invalid
    // it reverts with an InvalidProof error
    test("Invalid merkle proof for user inclusion - reverts", async () => {
      // Get the ATA for non earner one
      const nonEarnerOneATA = await getATA(mint.publicKey, nonEarnerOne.publicKey);

      // Get the inclusion proof for earner one in the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

      // Setup the instruction
      prepAddRegistrarEarner(nonAdmin, nonEarnerOneATA);

      // Attempt to add earner with invalid merkle proof
      await expectAnchorError(
        earn.methods
          .addRegistrarEarner(nonEarnerOne.publicKey, proof)
          .accounts({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        "InvalidProof"
      );
    });

    // given all the accounts are valid
    // given the merkle proof for the user in the earner list is valid
    // it creates the earner account
    // it sets the earner account's is_earning flag to true
    // it sets the earner account's earn_manager to None
    // it sets the earner account's last_claim_index to the current index
    test("Add registrar earner - success", async () => {
      // Get the ATA for earner one
      const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

      // Get the inclusion proof for earner one in the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

      // Setup the instruction
      const { earnerAccount } = prepAddRegistrarEarner(nonAdmin, earnerOneATA);

      // Add earner one to the earn manager's list
      await earn.methods
        .addRegistrarEarner(earnerOne.publicKey, proof)
        .accounts({ ...accounts })
        .signers([nonAdmin])
        .rpc();

      // Verify the earner account was initialized correctly
      await expectEarnerState(
        earnerAccount,
        {
          isEarning: true,
          earnManager: null,
          lastClaimIndex: new BN(1_100_000_000_000)
        }
      );
    });

  });

  describe("remove_registrar_earner unit tests", () => {
    // test cases
    // [X] given the earner account is not initialized
    //   [X] it reverts with an account not initialized error
    // [X] given all the accounts are valid
    //   [X] given empty merkle proof for user exclusion
    //     [X] it reverts with an InvalidProof error
    //   [X] given the merkle proof for user's exclusion from the earner list is invalid
    //     [X] it reverts with an InvalidProof error
    //   [X] given the merkle proof for user's exclusion from the earner list is valid
    //     [X] given the earner account has an earn manager
    //       [X] it reverts with a NotAuthorized error
    //     [X] given the earner account does not have an earn manager
    //       [X] it closes the earner account and refunds the rent to the signer

    beforeEach(async () => {
      // Initialize the program
      await initialize(
        earnAuthority.publicKey,
        initialIndex,
        claimCooldown
      );

      // Populate the earner merkle tree with the initial earners
      earnerMerkleTree = new MerkleTree([admin.publicKey, earnerOne.publicKey, earnerTwo.publicKey]);

      // Populate the earn manager merkle tree with the initial earn managers
      earnManagerMerkleTree = new MerkleTree([earnManagerOne.publicKey, earnManagerTwo.publicKey]);

      // Warp time forward past the initial cooldown period
      warp(claimCooldown, true);

      // Propagate a new index to start a new claim cycle and set the merkle roots
      await propagateIndex(new BN(1_100_000_000_000), earnerMerkleTree.getRoot(), earnManagerMerkleTree.getRoot());

      // Create an earner account for earner one
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);
      await addRegistrarEarner(earnerOne.publicKey, proof);

      // Remove earner one from the earner merkle tree
      earnerMerkleTree.removeLeaf(earnerOne.publicKey);

      // Update the earner merkle root on the global account
      const { globalAccount } = await propagateIndex(new BN(1_100_000_000_000), earnerMerkleTree.getRoot(), new Array(32).fill(0));

      // Confirm the global account is updated
      expectGlobalState(
        globalAccount,
        {
          index: new BN(1_100_000_000_000),
          earnerMerkleRoot: earnerMerkleTree.getRoot(),
          earnManagerMerkleRoot: earnManagerMerkleTree.getRoot()
        }
      );

    });

    // given the earner account is not initialized
    // it reverts with an account not initialized error
    test("Earner account is not initialized - reverts", async () => {
      // Get the ATA for non earner one
      const nonEarnerOneATA = await getATA(mint.publicKey, nonEarnerOne.publicKey);

      // Get the exclusion proof for non earner one against the earner merkle tree
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(nonEarnerOne.publicKey);

      // Setup the instruction
      prepRemoveRegistrarEarner(nonAdmin, nonEarnerOneATA);

      // Attempt to remove earner with uninitialized account
      await expectAnchorError(
        earn.methods
          .removeRegistrarEarner(nonEarnerOne.publicKey, proofs, neighbors)
          .accounts({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        "AccountNotInitialized"
      );
    });

    // given all the accounts are valid
    // given no proofs or neighbors are provided 
    // it reverts with an InvalidProof error
    test("Empty merkle proof for user exclusion - reverts", async () => {
      // Get the ATA for earner one
      const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

      // Setup the instruction
      prepRemoveRegistrarEarner(nonAdmin, earnerOneATA);

      // Attempt to remove earner with invalid merkle proof
      await expectAnchorError(
        earn.methods
          .removeRegistrarEarner(earnerOne.publicKey, [], [])
          .accounts({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        "InvalidProof"
      );
    });

    // given all the accounts are valid
    // given the merkle proof for user's exclusion from the earner list is invalid
    // it reverts with an InvalidProof error
    test("Invalid merkle proof for user exclusion - reverts", async () => {
      // Create earner account for earner two
      await addRegistrarEarner(earnerTwo.publicKey, earnerMerkleTree.getInclusionProof(earnerTwo.publicKey).proof);

      // Get the ATA for earner two
      const earnerTwoATA = await getATA(mint.publicKey, earnerTwo.publicKey);

      // Get the exclusion proof for earner one against the earner merkle tree
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(earnerOne.publicKey);

      // Setup the instruction
      prepRemoveRegistrarEarner(nonAdmin, earnerTwoATA);

      // Attempt to remove earner with invalid merkle proof
      await expectAnchorError(
        earn.methods
          .removeRegistrarEarner(earnerTwo.publicKey, proofs, neighbors)
          .accounts({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        "InvalidProof"
      );
        
    });

    // given all the accounts are valid
    // given the merkle proof for user's exclusion from the earner list is valid
    // given the earner account has an earn manager
    // it reverts with a NotAuthorized error
    test("Earner account has an earn manager - reverts", async () => {
      // Configure account for earn manager one
      const { proof } = earnManagerMerkleTree.getInclusionProof(earnManagerOne.publicKey);
      await configureEarnManager(earnManagerOne, new BN(100), proof);

      // Add non earner one as an earner under earn manager one
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(nonEarnerOne.publicKey);
      await addEarner(earnManagerOne, nonEarnerOne.publicKey, proofs, neighbors);

      // Get the ATA for non earner one
      const nonEarnerOneATA = await getATA(mint.publicKey, nonEarnerOne.publicKey);

      // Setup the instruction
      prepRemoveRegistrarEarner(nonAdmin, nonEarnerOneATA);

      // Attempt to remove earner with an earn manager
      await expectAnchorError(
        earn.methods
          .removeRegistrarEarner(nonEarnerOne.publicKey, proofs, neighbors)
          .accounts({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        "NotAuthorized"
      );
    });

    // given all the accounts are valid
    // given the merkle proof for user's exclusion from the earner list is valid
    // given the earner account does not have an earn manager
    // it sets the earner account's is_earning flag to false
    // it closes the earner account and refunds the rent to the signer
    test("Remove registrar earner - success", async () => {
      // Get the ATA for earner one
      const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

      // Get the exclusion proof for earner one against the earner merkle tree
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(earnerOne.publicKey);

      // Setup the instruction
      const { earnerAccount } = prepRemoveRegistrarEarner(nonAdmin, earnerOneATA);

      // Remove earner one from the earn manager's list
        await earn.methods
          .removeRegistrarEarner(earnerOne.publicKey, proofs, neighbors)
          .accounts({ ...accounts })
          .signers([nonAdmin])
          .rpc();

      // Verify the earner account was closed correctly
      expectAccountEmpty(earnerAccount);
    });
  });

  describe("remove_earn_manager unit tests", () => {
    // test cases
    // [ ] given the earn manager account is not initialized
    //   [ ] it reverts with an account not initialized error
    // [ ] given the earn manager account is initialized
    //   [ ] given the earn manager account is not active
    //     [ ] it reverts with a NotActive error
    //   [ ] given the earn manager account is active
    //     [ ] given the merkle proof for the earn manager's exclusion from the earn manager list is invalid
    //       [ ] it reverts with a NotAuthorized error
    //     [ ] given the merkle proof for the earn manager's exclusion from the earn manager list is valid
    //       [ ] it sets the earn manager account's is_active flag to false
  });

  describe("remove_orphaned_earner unit tests", () => {
    // test cases
    // [ ] given the user token account is for the wrong token mint
    //   [ ] it reverts with an address constraint error
    // [ ] given the earner account is not initialized
    //   [ ] it reverts with an account not initialized error
    // [ ] given the earn manager account is not initialized
    //   [ ] it reverts with an account not initialized error
    // [ ] given all the accounts are valid
    //   [ ] given the earner does not have an earn manager
    //     [ ] it reverts with a NotAuthorized error
    //   [ ] given the earner has an earn manager
    //     [ ] given the earn manager account is active
    //       [ ] it reverts with a NotAuthorized error
    //     [ ] given the earn manager account is not active
    //       [ ] it sets the earner account's is_earning flag to false
    //       [ ] it closes the earner account and refunds the rent to the signer

  });
}); 