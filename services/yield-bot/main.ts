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
import { PublicClient, createPublicClient, http } from '../../sdk/src';
import { instructions } from '@sqds/multisig';
import winston from 'winston';

const logger = configureLogger();

interface ParsedOptions {
  signer: Keypair;
  connection: Connection;
  evmClient: PublicClient;
  dryRun: boolean;
  skipCycle: boolean;
  squadsPda?: PublicKey;
}

// entrypoint for the yield bot command
export async function yieldCLI() {
  catchConsoleLogs();
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

      const evmClient: PublicClient = createPublicClient({ transport: http(evmRPC) });

      const options: ParsedOptions = {
        signer,
        connection: new Connection(rpc),
        evmClient,
        dryRun,
        skipCycle,
      };

      if (squadsPda) {
        options.squadsPda = new PublicKey(squadsPda);
      }

      await removeEarners(options);
      await distributeYield(options);
      await addEarners(options);
    });

  await program.parseAsync(process.argv);
}

async function distributeYield(opt: ParsedOptions) {
  const auth = await EarnAuthority.load(opt.connection, opt.evmClient);

  if (auth['global'].claimComplete) {
    logger.info('claim cycle already complete');
    return;
  }

  if (opt.skipCycle) {
    logger.info('skipping cycle');
    const ix = await auth.buildCompleteClaimCycleInstruction();
    if (!ix) {
      return;
    }

    const signature = await buildAndSendTransaction(opt, [ix]);
    logger.info('cycle complete', { signature });
    return;
  }

  // get all earners on the earn program
  const earners = await auth.getAllEarners();

  // build claim instructions
  let claimIxs: TransactionInstruction[] = [];
  for (const earner of earners) {
    logger.info('claiming yield for user', { earner: earner.pubkey.toBase58() });
    const ix = await auth.buildClaimInstruction(earner);
    if (ix) claimIxs.push(ix);
  }

  const [filteredIxs, distributed] = await auth.simulateAndValidateClaimIxs(claimIxs);

  logger.info('distributing M yield', {
    amount: distributed.toNumber(),
    claims: filteredIxs.length,
    belowThreshold: claimIxs.length - filteredIxs.length,
  });

  // complete cycle on last claim transaction
  const ix = await auth.buildCompleteClaimCycleInstruction();
  if (!ix) {
    return;
  }

  filteredIxs.push(ix);

  // send all the claims
  const signatures = await buildAndSendTransaction(opt, filteredIxs, 10, 'yield claim');
  logger.info('yield distributed', { signatures });
}

async function addEarners(opt: ParsedOptions) {
  console.log('adding earners');
  const registrar = new Registrar(opt.connection, opt.evmClient);
  
  const instructions = await registrar.buildMissingEarnersInstructions(opt.signer.publicKey);

  if (instructions.length === 0) {
    logger.info('no earners to add');
    return;
  }

  const signature = await buildAndSendTransaction(opt, instructions, 10, 'adding earners');
  logger.info('added earners', { signature, earners: instructions.length });
}

async function removeEarners(opt: ParsedOptions) {
  console.log('removing earners');
  const registrar = new Registrar(opt.connection, opt.evmClient);

  const instructions = await registrar.buildRemovedEarnersInstructions(opt.signer.publicKey);

  if (instructions.length === 0) {
    logger.info('no earners to remove');
    return;
  }

  const signature = await buildAndSendTransaction(opt, instructions, 10, 'removing earners');
  logger.info('removed earners', { signature, earners: instructions.length });
}

async function buildAndSendTransaction(
  opt: ParsedOptions,
  ixs: TransactionInstruction[],
  batchSize = 10,
  memo?: string,
): Promise<string[]> {
  const priorityFee = await getPriorityFee();
  const logs: string[][] = [];

  // simulate transactions first
  for (const txn of await buildTransactions(opt, ixs, priorityFee, batchSize, memo)) {
    const result = await opt.connection.simulateTransaction(txn, { sigVerify: false });
    if (result.value.err) {
      logger.error({
        message: 'Transaction simulation failed',
        logs: result.value.logs,
        err: result.value.err,
        b64: Buffer.from(txn.serialize()).toString('base64'),
      });
      throw new Error(`Transaction simulation failed: ${result.value.logs}`);
    }

    logs.push(result.value.logs ?? []);
  }

  const returnData: string[] = [];
  for (const [i, txn] of (await buildTransactions(opt, ixs, priorityFee, batchSize, memo)).entries()) {
    // return serialized transaction instead on dry run
    if (opt.dryRun) {
      returnData.push(Buffer.from(txn.serialize()).toString('base64'));
      continue;
    }

    const sig = await opt.connection.sendTransaction(txn, { skipPreflight: true });
    returnData.push(sig);

    logger.info('sent transaction', {
      base64: Buffer.from(txn.serialize()).toString('base64'),
      logs: logs[i],
      signature: sig,
    });
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
      logger.warn('failed to fetch priority fee data', { status: response.status, response: response.statusText });
      return defaultFee;
    }

    const data = await response.json();

    if (!data?.sol?.per_compute_unit?.percentiles) {
      logger.warn('invalid gas tracker response format');
      return defaultFee;
    }

    // use the 75th percentile as a reasonable default
    const priorityFee = data.sol.per_compute_unit.percentiles['75'];
    logger.debug('got priority fee', { priorityFee });

    return priorityFee;
  } catch (error) {
    logger.warn('error fetching priority fee', { error });
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
    memo: `yield bot: ${memo ?? 'proposal with no memo'}`,
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

function configureLogger() {
  let format: winston.Logform.Format;

  if (process.env.NODE_ENV !== 'production') {
    format = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.colorize(),
      winston.format.simple(),
    );
  } else {
    format = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.json(),
    );
  }

  return winston.createLogger({
    level: 'info',
    format,
    defaultMeta: { name: 'yield-bot' },
    transports: [new winston.transports.Console()],
  });
}

function catchConsoleLogs() {
  console.log = (message?: any, ...optionalParams: any[]) =>
    logger.info(message ?? 'console log', {
      params: optionalParams.map((p) => p.toString()),
    });
  console.error = (message?: any, ...optionalParams: any[]) =>
    logger.error(message ?? 'console error', {
      params: optionalParams.map((p) => p.toString()),
    });
}

// do not run the cli if this is being imported by jest
if (!process.argv[1].endsWith('jest')) {
  yieldCLI().catch((error) => {
    logger.error('yield bot failed', { error: error.toString() });
    process.exit(0);
  });
}
