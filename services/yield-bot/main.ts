import { Command } from 'commander';
import {
  Registrar,
  EarnAuthority,
  WinstonLogger,
  Graph,
  DEVNET_GRAPH_ID,
  ETH_MERKLE_TREE_BUILDER,
  ETH_MERKLE_TREE_BUILDER_DEVNET,
  EXT_PROGRAM_ID,
  MAINNET_GRAPH_ID,
  PROGRAM_ID,
  PublicClient,
  TransactionBuilder,
  createPublicClient,
  http,
} from '@m0-foundation/solana-m-sdk';
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
import { instructions } from '@sqds/multisig';
import BN from 'bn.js';
import { RateLimiter } from 'limiter';
import { sendSlackMessage, SlackMessage } from 'shared/slack';
import { logBlockchainBalance } from 'shared/balances';
import LokiTransport from 'winston-loki';
import winston from 'winston';
import { validateSubgraph } from 'shared/validation';
import { getProgram } from '@m0-foundation/solana-m-sdk/src/idl';

// logger used by bot and passed to SDK
const logger = new WinstonLogger('yield-bot', { imageBuild: process.env.BUILD_TIME ?? '' }, true);

let lokiTransport: LokiTransport;
if (process.env.LOKI_URL) {
  lokiTransport = getLokiTransport(process.env.LOKI_URL ?? '', logger.logger);
  logger.withTransport(lokiTransport);
}

// rate limit claims
const limiter = new RateLimiter({ tokensPerInterval: 2, interval: 1000 });

// meta info from job will be posted to slack
let slackMessage: SlackMessage;

interface ParsedOptions {
  signer: Keypair;
  connection: Connection;
  builder: TransactionBuilder;
  evmClient: PublicClient;
  merkleTreeAddress: `0x${string}`;
  graphClient: Graph;
  dryRun: boolean;
  skipCycle: boolean;
  squadsPda?: PublicKey;
  squadsVault?: PublicKey;
  claimThreshold: BN;
  programID: PublicKey;
  mint: 'M' | 'wM';
}

// entrypoint for the yield bot command
export async function yieldCLI() {
  const program = new Command();

  program
    .command('distribute')
    .option('-k, --keypair <base64>', 'Signer keypair (base64)')
    .option('-r, --rpc [URL]', 'Solana RPC URL', 'https://api.devnet.solana.com')
    .option('-e, --evmRPC [URL]', 'Ethereum RPC URL', 'https://ethereum-sepolia-rpc.publicnode.com')
    .option('-g, --graphKey <key>', 'API key for the subgraph')
    .option('-d, --dryRun [bool]', 'Build and simulate transactions without sending them', false)
    .option('-s, --skipCycle [bool]', 'Mark cycle as complete without claiming', false)
    .option(
      '-p, --squadsPda [pubkey]',
      'Propose transactions to squads vault instead of sending',
      '11111111111111111111111111111111',
    )
    .option(
      '-v, --squadsVault [pubkey]',
      'Squads vault that will sign transactions',
      '75VwgjdZLaesTXHG5tWHQWJS8DoANwZe4Yvzkwe2DanE',
    )
    .option('-t, --claimThreshold [bigint]', 'Threshold for claiming yield', '100000')
    .option('-i, --stepInterval [number]', 'Wait interval for steps', '5000')
    .option('--programID [pubkey]', 'Earn program ID', PROGRAM_ID.toBase58())
    .action(
      async ({
        keypair,
        rpc,
        evmRPC,
        dryRun,
        skipCycle,
        squadsPda,
        squadsVault,
        programID,
        claimThreshold,
        graphKey,
        stepInterval,
      }) => {
        let signer: Keypair;
        try {
          signer = Keypair.fromSecretKey(Buffer.from(JSON.parse(keypair)));
        } catch {
          signer = Keypair.fromSecretKey(Buffer.from(keypair, 'base64'));
        }

        await logBlockchainBalance('solana', rpc, signer.publicKey.toBase58(), logger);

        const evmClient: PublicClient = createPublicClient({ transport: http(evmRPC) });
        const graphID = rpc.includes('devnet') ? DEVNET_GRAPH_ID : MAINNET_GRAPH_ID;
        const connection = new Connection(rpc, 'confirmed');

        const options: ParsedOptions = {
          signer,
          connection,
          builder: new TransactionBuilder(connection),
          evmClient,
          merkleTreeAddress: rpc.includes('devnet') ? ETH_MERKLE_TREE_BUILDER_DEVNET : ETH_MERKLE_TREE_BUILDER,
          graphClient: new Graph(graphKey, graphID),
          dryRun,
          skipCycle,
          programID: new PublicKey(programID),
          claimThreshold: new BN(claimThreshold),
          mint: new PublicKey(programID).equals(EXT_PROGRAM_ID) ? 'wM' : 'M',
        };

        logger.addMetaField('mint', options.mint);

        slackMessage = {
          messages: [],
          mint: options.mint,
          service: 'yield-bot',
          level: 'info',
          devnet: rpc.includes('devnet'),
        };

        const squadsPDA = new PublicKey(squadsPda);

        if (!squadsPDA.equals(PublicKey.default)) {
          options.squadsPda = squadsPDA;
          options.squadsVault = new PublicKey(squadsVault);
          slackMessage.messages.push('Bot is in propose mode');
        }

        const steps = options.programID.equals(PROGRAM_ID)
          ? [validation, removeEarners, distributeYield, addEarners, syncIndex]
          : [validation, distributeYield];

        await executeSteps(options, steps, parseInt(stepInterval));
      },
    );

  await program.parseAsync(process.argv);
}

async function executeSteps(
  opt: ParsedOptions,
  steps: ((options: ParsedOptions) => Promise<boolean>)[],
  waitInterval: number,
) {
  for (const step of steps) {
    const continueSteps = await step(opt);

    if (!continueSteps) {
      logger.info('stopping execution early');
      return;
    }

    // wait interval to ensure transactions from previous steps have landed
    await new Promise((resolve) => setTimeout(resolve, waitInterval));
  }
}

async function validation(opt: ParsedOptions) {
  const auth = await EarnAuthority.load(opt.connection, opt.evmClient, opt.graphClient, opt.programID, logger);
  await validateSubgraph(auth, opt.graphClient);
  return true;
}

async function distributeYield(opt: ParsedOptions) {
  const auth = await EarnAuthority.load(opt.connection, opt.evmClient, opt.graphClient, opt.programID, logger);

  if (auth['global'].claimComplete) {
    logger.info('claim cycle already complete');
    return true;
  }

  if (opt.skipCycle) {
    logger.info('skipping cycle');
    const ix = await auth.buildCompleteClaimCycleInstruction();
    if (!ix) {
      return true;
    }

    const signature = await buildAndSendTransaction(opt, [ix]);
    logger.info('cycle complete', { signature });
    return true;
  }

  // get all earners on the earn program
  const earners = await auth.getAllEarners();

  // build claim instructions
  let claimIxs: TransactionInstruction[] = [];
  for (const earner of earners) {
    // throttle requests
    await limiter.removeTokens(1);

    const ix = await auth.buildClaimInstruction(earner);
    if (ix) claimIxs.push(ix);
  }

  const batchSize = 8;
  const [filteredIxs, distributed] = await auth.simulateAndValidateClaimIxs(claimIxs, batchSize, opt.claimThreshold);

  logger.info(`distributing ${opt.programID.equals(PROGRAM_ID) ? 'M' : 'wM'} yield`, {
    amount: distributed.toNumber(),
    claims: filteredIxs.length,
    belowThreshold: claimIxs.length - filteredIxs.length,
  });

  const amountDec = distributed.toNumber() / 1e6;
  slackMessage.messages.push(`Distributed ${amountDec.toFixed(2)} ${opt.mint} to ${filteredIxs.length} earners`);

  // send all the claims
  if (filteredIxs.length > 0) {
    const signatures = await buildAndSendTransaction(opt, filteredIxs, batchSize, 'yield claim');
    logger.info('yield distributed', { signatures });

    for (const sig of signatures) {
      slackMessage.messages.push(
        `Claims: https://solscan.io/tx/${sig}${opt.connection.rpcEndpoint.includes('devnet') ? '?cluster=devnet' : ''}`,
      );
    }
  }

  if (opt.programID.equals(PROGRAM_ID)) {
    // complete cycle on last claim transaction
    const completeClaimIx = await auth.buildCompleteClaimCycleInstruction();
    if (!completeClaimIx) {
      return true;
    }

    // wait for claim transactions to be confirmed before completing cycle
    const sigs = await buildAndSendTransaction(opt, [completeClaimIx], batchSize, 'complete claim cycle');
    logger.info('cycle complete', { signature: sigs[0] });
  }

  return true;
}

async function addEarners(opt: ParsedOptions) {
  logger.info('adding earners');
  const registrar = new Registrar(opt.connection, opt.evmClient, opt.graphClient, logger);

  const signer = opt.squadsPda ? opt.squadsVault! : opt.signer.publicKey;
  const instructions = await registrar.buildMissingEarnersInstructions(signer, opt.merkleTreeAddress);

  if (instructions.length === 0) {
    logger.info('no earners to add');
    return true;
  }

  const signature = await buildAndSendTransaction(opt, instructions, 10, 'adding earners');
  logger.info('added earners', { signature, earners: instructions.length });
  slackMessage.messages.push(`Added ${instructions.length} earners`);

  return true;
}

async function removeEarners(opt: ParsedOptions) {
  logger.info('removing earners');
  const registrar = new Registrar(opt.connection, opt.evmClient, opt.graphClient, logger);

  const signer = opt.squadsPda ? opt.squadsVault! : opt.signer.publicKey;
  const instructions = await registrar.buildRemovedEarnersInstructions(signer, opt.merkleTreeAddress);

  if (instructions.length === 0) {
    logger.info('no earners to remove');
    return true;
  }

  const signature = await buildAndSendTransaction(opt, instructions, 10, 'removing earners');
  logger.info('removed earners', { signature, earners: instructions.length });
  slackMessage.messages.push(`Removed ${instructions.length} earners`);

  return true;
}

async function syncIndex(opt: ParsedOptions) {
  logger.info('syncing index');
  const auth = await EarnAuthority.load(opt.connection, opt.evmClient, opt.graphClient, EXT_PROGRAM_ID, logger);
  const extIndex = auth['global'].index;

  // fetch the current index on the earn program
  const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID);
  const index = (await getProgram(opt.connection).account.global.fetch(globalAccount)).index;

  const logsFields = {
    extIndex: extIndex.toString(),
    index: index.toString(),
  };

  if (extIndex.eq(index)) {
    slackMessage.messages.push('index already synced');
    logger.info('index already synced', logsFields);
    return false;
  }

  const ix = await auth.buildIndexSyncInstruction();
  const signature = await buildAndSendTransaction(opt, [ix], 10, 'sync index');

  logger.info('updated index on ext earn', { ...logsFields, signature: signature[0] });
  slackMessage.messages.push(`Synced index: ${signature[0]}`);

  return true;
}

async function buildAndSendTransaction(
  opt: ParsedOptions,
  ixs: TransactionInstruction[],
  batchSize = 10,
  memo?: string,
  retry = true,
): Promise<string[]> {
  const priorityFee = await getPriorityFee();
  const logs: string[][] = [];

  // simulate transactions first
  for (const txn of await buildTransactions(opt, ixs, priorityFee, batchSize, memo)) {
    const result = await opt.connection.simulateTransaction(txn, { sigVerify: false });
    if (result.value.err) {
      logger.error('Transaction simulation failed', {
        logs: result.value.logs,
        err: result.value.err,
        b64: Buffer.from(txn.serialize()).toString('base64'),
      });

      if (retry) {
        logger.info('retrying transaction');
        await new Promise((resolve) => setTimeout(resolve, 2500));
        return buildAndSendTransaction(opt, ixs, batchSize, memo, false);
      }

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
      opt.connection.confirmTransaction(
        {
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight,
          signature,
        },
        'confirmed',
      ),
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
  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee });

  // split instructions into batches
  const transactions: VersionedTransaction[] = [];

  for (let i = 0; i < ixs.length; i += batchSize) {
    const batchIxs = ixs.slice(i, i + batchSize);

    // build propose transaction for squads vault
    if (opt.squadsPda) {
      const squadsTxn = await proposeSquadsTransaction(opt, [computeBudgetIx, ...batchIxs], priorityFee, memo);
      transactions.push(squadsTxn);
      continue;
    }

    const tx = await opt.builder.buildTransaction(batchIxs, opt.signer.publicKey, priorityFee);

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
  priorityFee = 250_000,
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

  const tx = await opt.builder.buildTransaction([ix1, ix2], opt.signer.publicKey, priorityFee);
  tx.sign([opt.signer]);

  return tx;
}

function getLokiTransport(host: string, logger: winston.Logger) {
  return new LokiTransport({
    host,
    json: true,
    useWinstonMetaAsLabels: true,
    ignoredMeta: ['imageBuild'],
    format: logger.format,
    batching: true,
    timeout: 15_000,
    onConnectionError: (error: any) => {
      logger.error('Loki connection error:', { error: `${error}` });
    },
  });
}

// do not run the cli if this is being imported by jest
if (!process.argv[1].endsWith('jest')) {
  yieldCLI()
    .catch((error) => {
      logger.error(error);
      slackMessage.level = 'error';
      slackMessage.messages.push(`${error}`);
    })
    .finally(async () => {
      if (slackMessage.messages.length === 0) {
        slackMessage.messages.push('No actions taken');
      }
      await lokiTransport?.flush();
      await sendSlackMessage(slackMessage);
      process.exit(0);
    });
}
