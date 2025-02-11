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
  getMint,
  getMintLen,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { loadKeypair } from "../test-utils";
import { Earn } from "../../target/types/earn";
import { MintMaster } from "../../target/types/mint_master";
import { Registrar } from "../../target/types/registrar";

const EARN_IDL = require("../../target/idl/earn.json");
const MINT_MASTER_IDL = require("../../target/idl/mint_master.json");
const REGISTRAR_IDL = require("../../target/idl/registrar.json");

// Unit tests for earn program
// [ ] initialize
//   [ ] given the admin signs the transaction
//      [ ] the global account is created
//      [ ] the earn authority is set correctly
//      [ ] the initial index is set correctly
//      [ ] the claim cooldown is set correctly
//   [ ] given a non-admin signs the transaction
//      [ ] the transaction reverts with an address constraint error
//
// [ ] set_earn_authority
//   [ ] given the admin signs the transaction
//      [ ] the earn authority is updated
//   [ ] given a non-admin signs the transaction
//      [ ] the transaction reverts with an address constraint error
//
// [ ] propagate_index
//   [ ] given the portal signs the transaction
//      [ ] the index is updated
//      [ ] the max yield is calculated correctly
//   [ ] given a non-portal signs the transaction
//      [ ] the transaction reverts with an invalid signer error
//   [ ] given the cooldown period has not elapsed
//      [ ] the transaction reverts with a cooldown not elapsed error
//
// [ ] claim
//   [ ] given the earn authority signs the transaction
//      [ ] tokens are minted to the destination account
//      [ ] the mint amount is correct based on the index
//   [ ] given a non-earn-authority signs the transaction
//      [ ] the transaction reverts with an invalid signer error
//   [ ] given the previous claim cycle is not complete
//      [ ] the transaction reverts with a claim in progress error

// Setup wallets once at the beginning of the test suite
const admin: Keypair = loadKeypair("test-addr/admin.json");
const portal: Keypair = loadKeypair("test-addr/portal.json");
const mint: Keypair = loadKeypair("test-addr/mint.json");
const earnAuthority: Keypair = new Keypair();
const nonAdmin: Keypair = new Keypair();

let svm: LiteSVM;
let provider: LiteSVMProvider;
let accounts: Record<string, PublicKey> = {};
let earn: Program<Earn>;
let mintMaster: Program<MintMaster>;
let registrar: Program<Registrar>;

// Start parameters
const initialSupply = new BN(100_000_000); // 100 tokens with 6 decimals
const initialIndex = new BN(1_000_000); // 1.0
const claimCooldown = new BN(86_400) // 1 day

// Type definitions for accounts to make it easier to do comparisons

interface Global {
  earnAuthority?: PublicKey;
  index?: BN;
  timestamp?: BN;
  claimCooldown?: BN;
  rewardsPerToken?: BN;
  maxSupply?: BN;
  maxYield?: BN;
  distributed?: BN;
  claimComplete?: boolean;
}

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

const expectGlobalState = async (
  globalAccount: PublicKey,
  expected: Global
) => {
  const state = await earn.account.global.fetch(globalAccount);
  
  if (expected.earnAuthority) expect(state.earnAuthority).toEqual(expected.earnAuthority);
  if (expected.index) expect(state.index.toString()).toEqual(expected.index.toString());
  if (expected.timestamp) expect(state.timestamp.toString()).toEqual(expected.timestamp.toString());
  if (expected.claimCooldown) expect(state.claimCooldown.toString()).toEqual(expected.claimCooldown.toString());
  if (expected.rewardsPerToken) expect(state.rewardsPerToken.toString()).toEqual(expected.rewardsPerToken.toString());
  if (expected.maxSupply) expect(state.maxSupply.toString()).toEqual(expected.maxSupply.toString());
  if (expected.maxYield) expect(state.maxYield.toString()).toEqual(expected.maxYield.toString());
  if (expected.distributed) expect(state.distributed.toString()).toEqual(expected.distributed.toString());
  if (expected.claimComplete !== undefined) expect(state.claimComplete).toEqual(expected.claimComplete);
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

const createMint = async (mint: Keypair, mintAuthority: PublicKey) => {
  const mintLen = getMintLen([]);
  const mintLamports =
    await provider.connection.getMinimumBalanceForRentExemption(mintLen);
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

  await provider.sendAndConfirm(tx, [admin, mint]);

  // Verify the mint was created properly
  const mintInfo = await provider.connection.getAccountInfo(mint.publicKey);
  if (!mintInfo) {
    throw new Error("Mint account was not created");
  }

  return mint.publicKey;
};

const mintM = async (to: PublicKey, amount: BN) => {
  const [mintMasterAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint-master")],
    mintMaster.programId
  );

  const toATA: PublicKey = await getATA(mint.publicKey, to);

  // Populate accounts for the instruction
  accounts = {};
  accounts.signer = portal.publicKey;
  accounts.mintMaster = mintMasterAccount;
  accounts.mint = mint.publicKey;
  accounts.toTokenAccount = toATA;
  accounts.tokenProgram = TOKEN_2022_PROGRAM_ID;

  // Send the instruction
  await mintMaster.methods
    .mintM(amount)
    .accounts({...accounts})
    .signers([portal])
    .rpc();
};

const warp = (seconds: BN, increment: boolean) => {
  const clock = svm.getClock();
  clock.unixTimestamp = increment ? clock.unixTimestamp + BigInt(seconds.toString()) : BigInt(seconds.toString());
  svm.setClock(clock);
};

// instruction convenience functions
const prepInitialize = (signer: Keypair) => {
  // Find the global PDA
  const [globalAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    earn.programId
  );

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
  // Find the global PDA
  const [globalAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    earn.programId
  );

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
  // Find the global PDA
  const [globalAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    earn.programId
  ); 

  // Populate accounts
  accounts = {};
  accounts.signer = signer.publicKey;
  accounts.globalAccount = globalAccount;
  accounts.mint = mint.publicKey;

  return { globalAccount };
};

const propagateIndex = async (newIndex: BN) => {
  // Setup the instruction
  const { globalAccount } = prepPropagateIndex(portal);

  // Send the instruction
  await earn.methods
    .propagateIndex(newIndex)
    .accounts({...accounts})
    .signers([portal])
    .rpc();

  // We don't check state here because it depends on the circumstances

  return { globalAccount };
};

const prepCompleteClaims = (signer: Keypair) => {
  // Find the global PDA
  const [globalAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    earn.programId
  ); 

  // Populate accounts
  accounts = {};
  accounts.signer = signer.publicKey;
  accounts.globalAccount = globalAccount;

  return { globalAccount }; 
};

const completeClaims = async () => {
  // Setup the instruction
  await prepCompleteClaims(earnAuthority);

  // Send the instruction
  await earn.methods
    .completeClaims()
    .accounts({...accounts})
    .signers([earnAuthority])
    .rpc();
}


describe("Earn unit tests", () => {
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

    // Create program instances
    earn = new Program<Earn>(EARN_IDL, provider);
    mintMaster = new Program<MintMaster>(MINT_MASTER_IDL, provider);
    registrar = new Program<Registrar>(REGISTRAR_IDL, provider);

    // Fund the wallets
    svm.airdrop(admin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(portal.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(earnAuthority.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(nonAdmin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

    // Get the mint master PDA to be the mint authority
    const [mintMasterAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint-master")],
      mintMaster.programId
    );

    // Get the earn global PDA to be the distributor on the mint master
    const [globalAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("global")],
      earn.programId
    );

    // Initialize the mint master program
    await mintMaster.methods
      .initialize(portal.publicKey, globalAccount)
      .accounts({
        signer: admin.publicKey,
        mintMaster: mintMasterAccount,
        systemProgram: SystemProgram.programId
      })
      .signers([admin])
      .rpc();

    // Create the token mint
    await createMint(mint, mintMasterAccount);

    // Mint some tokens to have a non-zero supply
    await mintM(admin.publicKey, initialSupply);
  });

  describe("initialize unit tests", () => {
    // given the admin signs the transaction
    // the global account is created and configured correctly
    test("Admin can initialize earn program", async () => {
      // Setup the instruction call
      const { globalAccount } = prepInitialize(admin);

      // Create and send the transaction
      await earn.methods
        .initialize(earnAuthority.publicKey, initialIndex, claimCooldown)
        .accounts({ ...accounts })
        .signers([admin])
        .rpc();

      // Verify the global state
      await expectGlobalState(
        globalAccount,
        {
            earnAuthority: earnAuthority.publicKey,
            index: initialIndex,
            claimCooldown,
            claimComplete: true
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
    test("Portal can update index", async () => {
      const newIndex = new BN(1_100_000); // 1.1

      const { globalAccount } = prepPropagateIndex(portal);
      
      await earn.methods
        .propagateIndex(newIndex)
        .accounts({...accounts})
        .signers([portal])
        .rpc();

      // Verify the global state was updated
      await expectGlobalState(globalAccount, {
        index: newIndex,
      });
    });

    // given the portal does not sign the transaction
    // the transaction fails with a not authorized error
    test("Non-portal cannot update index", async () => {
      const newIndex = new BN(1_100_000);

      prepPropagateIndex(nonAdmin);
      
      await expectAnchorError(
        earn.methods
          .propagateIndex(newIndex)
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
      const newIndex = new BN(1_100_000);
      const { globalAccount } = await propagateIndex(newIndex);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());

      // Confirm that the index and timestamp is update
      await expectGlobalState(
        globalAccount,
        {
          index: newIndex,
          timestamp: startTimestamp,
          maxSupply: initialSupply
        }
      );

      // Propagate another new index immediately,
      // the index shouldn't be updated, 
      // but the max supply should increment with the new supply
      const newNewIndex = new BN(1_150_000);

      await propagateIndex(newNewIndex);

      // Check the state
      await expectGlobalState(
        globalAccount,
        {
          index: newIndex,
          timestamp: startTimestamp,
          maxSupply: initialSupply
        }
      );
    });

    // given the last claim hasn't been completed
    // given the time is within the cooldown period
    // given current supply is greater than max supply
    // max supply is updated to the current supply
    test("propagate index - claim not complete, within cooldown period, supply > max supply", async () => {
      // Update the index initially
      const newIndex = new BN(1_100_000);
      const { globalAccount } = await propagateIndex(newIndex);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());

      // Mint more tokens to increase supply
      const additionalSupply = new BN(50_000_000);
      await mintM(admin.publicKey, additionalSupply);
      const newSupply = initialSupply.add(additionalSupply);

      // Try to propagate new index
      const newNewIndex = new BN(1_150_000);
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
      const newIndex = new BN(1_100_000);
      const { globalAccount } = await propagateIndex(newIndex);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());

      // Set claim complete
      await completeClaims();

      // Mint more tokens
      const additionalSupply = new BN(50_000_000);
      await mintM(admin.publicKey, additionalSupply);
      const newSupply = initialSupply.add(additionalSupply);

      // Try to propagate new index
      const newNewIndex = new BN(1_150_000);
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
      const newIndex = new BN(1_100_000);
      const { globalAccount } = await propagateIndex(newIndex);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());

      // Set claim complete
      await completeClaims();

      // Try to propagate new index
      const newNewIndex = new BN(1_150_000);
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
      const newIndex = new BN(1_100_000);
      const { globalAccount } = await propagateIndex(newIndex);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());

      // Warp past cooldown
      warp(claimCooldown.add(new BN(1)), true);

      // Mint more tokens
      const additionalSupply = new BN(50_000_000);
      await mintM(admin.publicKey, additionalSupply);
      const newSupply = initialSupply.add(additionalSupply);

      // Try to propagate new index
      const newNewIndex = new BN(1_150_000);
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
      const newIndex = new BN(1_100_000);
      const { globalAccount } = await propagateIndex(newIndex);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());

      // Warp past cooldown
      warp(claimCooldown.add(new BN(1)), true);

      // Try to propagate new index
      const newNewIndex = new BN(1_150_000);
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
      const newIndex = new BN(1_100_000);
      const { globalAccount } = await propagateIndex(newIndex);

      // Set claim complete
      await completeClaims();

      // Warp past cooldown
      warp(claimCooldown.add(new BN(1)), true);

      // Try to propagate new index
      const newNewIndex = new BN(1_150_000);
      await propagateIndex(newNewIndex);

      // Calculate expected rewards per token and max yield
      const REWARDS_SCALE = new BN(1_000_000_000_000);
      const rewardsPerToken = newNewIndex.mul(REWARDS_SCALE).div(newIndex);
      const maxYield = rewardsPerToken.mul(initialSupply).div(REWARDS_SCALE);

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
          rewardsPerToken,
          claimComplete: false
        }
      );
    });
  });

  describe("claim_for unit tests", () => {
    beforeEach(() => {});

    // test cases
    // [ ] given the earn authority does not sign the transaction
    //   [ ] it reverts with an address constraint error
    // [ ] given the earn authority signs the transaction
    //   [ ] given the user token account' earner account is not initialized
    //     [ ] it reverts with an account not initialized error
    //   [ ] given the earner's is_earning status is false
    //     [ ] it reverts with a NotEarning error
    //   [ ] given the earner's last claim index is the current index
    //     [ ] it reverts with an AlreadyClaimed error
    //   [ ] given the amonut to be minted causes the total distributed to exceed the max yield
    //     [ ] it reverts with am ExceedsMaxYield error
    //   [ ] given the earner doesn't have an earn manager
    //     [ ] the correct amount is minted to the earner
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





  });

  describe("complete_claim unit tests", () => {});

  describe("configure earn_manager unit tests", () => {});

  describe("add_earner unit tests", () => {});

  describe("remove_earner unit tests", () => {});  

  describe("add_register_earner unit tests", () => {});

  describe("remove_registrar_earner unit tests", () => {});

  describe("remove_earn_manager unit tests", () => {});
}); 