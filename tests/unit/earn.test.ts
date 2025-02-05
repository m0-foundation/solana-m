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

// instruction convenience functions
const prepInitialize = (signer: Keypair) => {
  // Find the global PDA
  const [globalAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    earn.programId
  );

  // Populate accounts for the instruction
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
  accounts.signer = signer.publicKey;
  accounts.globalAccount = globalAccount;
  accounts.systemProgram = SystemProgram.programId;

  return { globalAccount };
}

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

    // Clear the accounts object
    accounts = {};
  });

  describe("initialize unit tests", () => {
    // given the admin signs the transaction
    // the global account is created and configured correctly
    test("Admin can initialize earn program", async () => {
      // Setup the instruction call
      const { globalAccount } = prepInitialize(admin);
      const initialIndex = new BN(1_000_000); // 1.0
      const claimCooldown = new BN(86400); // 1 day

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
      const initialIndex = new BN(1_000_000); // 1.0
      const claimCooldown = new BN(86400); // 1 day

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
    test("Admin can set new earn authority", async () => {
      // Initialize the program first
      const globalAccount = await initialize(
        earnAuthority.publicKey,
        new BN(1_000_000),
        new BN(86400)
      );

      // Setup new earn authority
      const newEarnAuthority = new Keypair();

      // Setup the instruction
      await prepSetEarnAuthority(admin);

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
      // Initialize the program first
      const globalAccount = await initialize(
        earnAuthority.publicKey,
        new BN(1_000_000),
        new BN(86400)
      );

      // Attempt to set new earn authority with non-admin
      const newEarnAuthority = new Keypair();

      await prepSetEarnAuthority(nonAdmin);
      
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

//   describe("propagate_index unit tests", () => {
//     test("Portal can update index", async () => {
//       // Initialize the program
//       const globalAccount = await initialize(
//         earnAuthority.publicKey,
//         new BN(1_000_000), // 1.0
//         new BN(1) // Set small cooldown for testing
//       );

//       // Advance clock by cooldown period
//       svm.setTime(Date.now() / 1000 + 2);

//       const newIndex = new BN(1_100_000); // 1.1
      
//       await earn.methods
//         .propagateIndex(newIndex)
//         .accounts({
//           signer: portal.publicKey,
//           globalAccount,
//         })
//         .signers([portal])
//         .rpc();

//       // Verify the global state was updated
//       await expectGlobalState(globalAccount, {
//         index: newIndex,
//       });
//     });

//     test("Non-portal cannot update index", async () => {
//       const globalAccount = await initialize(
//         earnAuthority.publicKey,
//         new BN(1_000_000),
//         new BN(1)
//       );

//       svm.setTime(Date.now() / 1000 + 2);

//       await expectAnchorError(
//         earn.methods
//           .propagateIndex(new BN(1_100_000))
//           .accounts({
//             signer: nonAdmin.publicKey,
//             globalAccount,
//           })
//           .signers([nonAdmin])
//           .rpc(),
//         "ConstraintAddress"
//       );
//     });

//     test("Cannot update index before cooldown period", async () => {
//       const globalAccount = await initialize(
//         earnAuthority.publicKey,
//         new BN(1_000_000),
//         new BN(86400) // 1 day cooldown
//       );

//       // Try to update immediately without waiting
//       await expectAnchorError(
//         earn.methods
//           .propagateIndex(new BN(1_100_000))
//           .accounts({
//             signer: portal.publicKey,
//             globalAccount,
//           })
//           .signers([portal])
//           .rpc(),
//         "CooldownNotElapsed"
//       );
//     });
//   });
}); 