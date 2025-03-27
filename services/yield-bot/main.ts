import { Command } from 'commander';
import { Registrar } from '../../sdk/src/registrar';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import EarnAuthority from '../../sdk/src/earn_auth';
import { instructions, transactions } from '@sqds/multisig';

interface ParsedOptions {
  signer: Keypair;
  connection: Connection;
  evmRPC: string;
  dryRun: boolean;
  skipCycle: boolean;
  squadsPda?: PublicKey;
}

// entrypoint for the yield bot command
export async function yieldCLI() {
  const program = new Command();

  program
    .command('distribute')
    .option('-k, --keypair <base64>', 'Signer keypair (base64)')
    .option('-r, --rpc [URL]', 'Solana RPC URL', 'https://api.devnet.solana.com')
    .option('-e, --evmRPC [URL]', 'Ethereum RPC URL', 'https://ethereum-sepolia-rpc.publicnode.com')
    .option('-d, --dryRun [bool]', 'Build and simulate transactions without sending them', false)
    .option('-s, --skipCycle [bool]', 'Mark cycle as complete without claiming', false)
    .option('-p, --squadsPda [pubkey]', 'Propose transactions to squads vault instead of sending')
    .action(async ({ keypair, rpc, evmRPC, dryRun, skipCycle, squadsPda }) => {
      let signer: Keypair;
      try {
        signer = Keypair.fromSecretKey(Buffer.from(JSON.parse(keypair)));
      } catch {
        signer = Keypair.fromSecretKey(Buffer.from(keypair, 'base64'));
      }

      const options: ParsedOptions = {
        signer,
        connection: new Connection(rpc),
        evmRPC,
        dryRun,
        skipCycle,
      };

      if (squadsPda) {
        options.squadsPda = new PublicKey(squadsPda);
      }

      // await removeEarners(options);
      await distributeYield(options);
      // await addEarners(options);
    });

  await program.parseAsync(process.argv);
}

async function distributeYield(opt: ParsedOptions) {
  console.log('distributing yield');
  const auth = await EarnAuthority.load(opt.connection);

  if (opt.skipCycle) {
    console.log('skipping cycle');
    const ix = await auth.buildCompleteClaimCycleInstruction();
    const signature = await buildAndSendTransaction(opt, [ix]);
    console.log(`cycle complete: ${signature}`);
    return;
  }

  // get all earners on the earn program
  const earners = await auth.getAllEarners();

  // build claim instructions
  const claimIxs = [];
  for (const earner of earners) {
    console.log(`claiming yield for ${earner.pubkey.toBase58()}`);
    claimIxs.push(await auth.buildClaimInstruction(earner));
  }

  // verify that there are no reverts and claims do not exceed max yield
  // const distributed = await auth.simulateAndValidateClaimIxs(claimIxs);
  // console.log(`distributing ${distributed} M in yield`);

  // send all the claims
  const signatures = await buildAndSendTransaction(opt, claimIxs);
  console.log(`yield distributed: ${signatures}`);
}

async function addEarners(opt: ParsedOptions) {
  console.log('adding earners');
  const registrar = new Registrar(opt.connection, opt.evmRPC);
  const instructions = await registrar.buildMissingEarnersInstructions(opt.signer.publicKey);

  if (instructions.length === 0) {
    console.log('no earners to add');
    return;
  }

  if (opt.dryRun) {
    console.log(`dry run: not adding ${instructions.length} earners`);
    return;
  }

  const signature = await buildAndSendTransaction(opt, instructions);
  console.log(`added ${instructions.length} earners: ${signature}`);
}

async function removeEarners(opt: ParsedOptions) {
  console.log('removing earners');
  const registrar = new Registrar(opt.connection, opt.evmRPC);
  const instructions = await registrar.buildRemovedEarnersInstructions(opt.signer.publicKey);

  if (instructions.length === 0) {
    console.log('no earners to remove');
    return;
  }

  if (opt.dryRun) {
    console.log(`dry run: not removing ${instructions.length} earners`);
    return;
  }

  const signature = await buildAndSendTransaction(opt, instructions);
  console.log(`removed ${instructions.length} earners: ${signature}`);
}

async function buildAndSendTransaction(
  opt: ParsedOptions,
  ixs: TransactionInstruction[],
  batchSize = 10,
  memo?: string,
): Promise<string[]> {
  const priorityFee = await getPriorityFee();

  // simulate transactions first
  for (const txn of await buildTransactions(opt, ixs, priorityFee, batchSize, memo)) {
    const result = await opt.connection.simulateTransaction(txn);
    if (result.value.err) {
      throw new Error(`Transaction simulation failed: ${result.value.logs}`);
    }
  }

  const returnData: string[] = [];
  for (const txn of await buildTransactions(opt, ixs, priorityFee, batchSize, memo)) {
    // return serialized transaction instead on dry run
    if (opt.dryRun) {
      returnData.push(Buffer.from(txn.serialize()).toString('base64'));
    }

    returnData.push(await opt.connection.sendTransaction(txn, { skipPreflight: opt.dryRun }));
  }

  if (opt.dryRun) {
    return returnData;
  }

  const { lastValidBlockHeight, blockhash } = await opt.connection.getLatestBlockhash();

  // confirm all transactions
  await Promise.all(
    returnData.map((signature) =>
      opt.connection.confirmTransaction({
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight,
        signature,
      }),
    ),
  );

  return returnData;
}

async function buildTransactions(
  opt: ParsedOptions,
  ixs: TransactionInstruction[],
  priorityFee = 250_000,
  batchSize = 10,
  memo?: string,
): Promise<VersionedTransaction[]> {
  const { blockhash } = await opt.connection.getLatestBlockhash();
  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee });

  // split instructions into batches
  const transactions: VersionedTransaction[] = [];

  for (let i = 0; i < ixs.length; i += batchSize) {
    const batchIxs = ixs.slice(i, i + batchSize);

    // build propose transaction for squads vault
    if (opt.squadsPda) {
      const squadsTxn = await proposeSquadsTransaction(opt, [computeBudgetIx, ...batchIxs], memo);
      transactions.push(squadsTxn);
      continue;
    }

    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: opt.signer.publicKey,
        recentBlockhash: blockhash,
        instructions: [computeBudgetIx, ...batchIxs],
      }).compileToV0Message(),
    );

    tx.sign([opt.signer]);
    transactions.push(tx);
  }

  return transactions;
}

async function getPriorityFee(): Promise<number> {
  const defaultFee = 250_000;
  try {
    const response = await fetch('https://quicknode.com/_gas-tracker?slug=solana');

    if (!response.ok) {
      console.warn(`failed to fetch priority fee data: ${response.status} ${response.statusText}`);
      return defaultFee;
    }

    const data = await response.json();

    if (!data?.sol?.per_compute_unit?.percentiles) {
      console.warn('invalid gas tracker response format');
      return defaultFee;
    }

    // use the 75th percentile as a reasonable default
    const priorityFee = data.sol.per_compute_unit.percentiles['75'];
    console.log(`got priority fee (75th percentile): ${priorityFee} microlamports per compute unit`);

    return priorityFee;
  } catch (error) {
    console.warn(`error fetching priority fee: ${error}`);
    return defaultFee;
  }
}

async function proposeSquadsTransaction(
  opt: ParsedOptions,
  ixs: TransactionInstruction[],
  memo?: string,
): Promise<VersionedTransaction> {
  const [vaultPda] = multisig.getVaultPda({
    multisigPda: opt.squadsPda!,
    index: 0,
  });

  const transactionMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: (await opt.connection.getLatestBlockhash()).blockhash,
    instructions: ixs,
  });

  // get the multisig transaction index
  const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(opt.connection, opt.squadsPda!);
  const currentTransactionIndex = Number(multisigInfo.transactionIndex);
  const newTransactionIndex = BigInt(currentTransactionIndex + 1);

  const blockhash = (await opt.connection.getLatestBlockhash()).blockhash;

  // create transaction
  const ix1 = instructions.vaultTransactionCreate({
    multisigPda: opt.squadsPda!,
    transactionIndex: newTransactionIndex,
    creator: opt.signer.publicKey,
    rentPayer: opt.signer.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage,
    memo: memo ?? 'proposal from yield bot',
  });

  // propose transaction
  const ix2 = instructions.proposalCreate({
    multisigPda: opt.squadsPda!,
    creator: opt.signer.publicKey,
    rentPayer: opt.signer.publicKey,
    transactionIndex: newTransactionIndex,
  });

  const message = new TransactionMessage({
    payerKey: opt.signer.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix1, ix2],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([opt.signer]);

  return tx;
}

// do not run the cli if this is being imported by jest
if (!process.argv[1].endsWith('jest')) {
  yieldCLI().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
