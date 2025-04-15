import { Command } from 'commander';
import { Connection } from '@solana/web3.js';
import { createWalletClient, getContract, http, WalletClient, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { GLOBAL_ACCOUNT } from '../../sdk/src';
import { WinstonLogger } from '../../sdk/src/logger';
import { sendSlackMessage, SlackMessage } from '../shared/slack';

export const HUB_PORTAL: `0x${string}` = '0xD925C84b55E4e44a53749fF5F2a5A13F63D128fd';

// logger used by bot and passed to SDK
const logger = new WinstonLogger('index-bot', { imageBuild: process.env.BUILD_TIME ?? '' }, true);
if (process.env.LOKI_URL) logger.withLokiTransport(process.env.LOKI_URL);

// meta info from job will be posted to slack
let slackMessage: SlackMessage;

interface ParsedOptions {
  solanaClient: Connection;
  evmClient: WalletClient;
  threshold: bigint;
  force: boolean;
  dryRun: boolean;
}

// entrypoint for the index bot command
export async function indexCLI() {
  const program = new Command();

  program
    .command('push')
    .description('Push the latest index from Ethereum to Solana')
    .option('-s, --solanaRpc [URL]', 'Solana RPC URL', 'https://api.devnet.solana.com')
    .option('-e, --ethRpc [URL]', 'Ethereum RPC URL', 'https://ethereum-sepolia-rpc.publicnode.com')
    .option('-k, --ethPrivateKey <KEY>', 'Ethereum private key')
    .option('-t, --threshold [SECONDS]', 'Staleness threshold in seconds', '86400')
    .option('-f, --force', 'Force push the index even if it is not stale', false)
    .option('--dryRun', 'Do not send transactions', false)
    .action(async ({ solanaRpc, ethRpc, ethPrivateKey, threshold, force, dryRun }) => {
      const solanaClient = new Connection(solanaRpc);
      const evmClient = createWalletClient({
        transport: http(ethRpc),
        account: privateKeyToAccount(ethPrivateKey as Hex),
      });

      const options: ParsedOptions = {
        solanaClient,
        evmClient,
        threshold: BigInt(threshold),
        force,
        dryRun,
      };

      slackMessage = {
        messages: [],
        mint: 'M',
        service: 'index-bot',
        level: 'info',
        devnet: solanaRpc.includes('devnet'),
      };

      await pushIndex(options);
    });

  await program.parseAsync(process.argv);
}

async function pushIndex(options: ParsedOptions) {
  if (!options.force) {
    const isStale = await isIndexStale(options);
    if (!isStale) {
      slackMessage.messages.push('Index is not stale, skipping push');
      logger.info('Index is not stale, skipping push');
      return;
    }
    logger.info('Index is stale, pushing updated index');
  } else {
    logger.info('Force pushing index');
  }

  const tx = await sendIndexUpdate(options);

  if (options.dryRun) {
    logger.info('Dry run complete, not sending transaction');
  } else {
    slackMessage.messages.push('Index updated');
    slackMessage.explorer = `https://wormholescan.io/#/tx/${tx}`;
    logger.info('Index pushed successfully');
  }
}

async function isIndexStale(options: ParsedOptions) {
  // Get the current index from the Solana program
  const globalAccount = await options.solanaClient.getAccountInfo(GLOBAL_ACCOUNT);
  if (!globalAccount) {
    throw new Error('Global account not found');
  }

  const lastUpdateTimestamp = globalAccount.data.readBigUInt64LE(8 + 32 * 3 + 8); // timestamp is after discriminator, 3 pubkeys, and the index
  const currentTimestamp = BigInt(Math.floor(Date.now() / 1000)); // current timestamp in seconds

  if (options.dryRun) {
    logger.debug('Checking index staleness', {
      lastUpdateTimestamp: lastUpdateTimestamp.toString(),
      currentTimestamp: currentTimestamp.toString(),
      threshold: options.threshold.toString(),
      stale: currentTimestamp - lastUpdateTimestamp > options.threshold,
    });
  }

  return currentTimestamp - lastUpdateTimestamp > options.threshold;
}

async function sendIndexUpdate(options: ParsedOptions) {
  // function sendMTokenIndex(
  //     uint16 destinationChainId_,
  //     bytes32 refundAddress_
  // ) external payable returns (bytes32 messageId_)
  //
  // function quoteDeliveryPrice(
  //     uint16 recipientChain,
  //     bytes memory transceiverInstructions
  // ) public view returns (uint256[] memory, uint256) {
  const abi = [
    {
      inputs: [
        { internalType: 'uint16', name: 'destinationChainId_', type: 'uint16' },
        { internalType: 'bytes32', name: 'refundAddress_', type: 'bytes32' },
      ],
      name: 'sendMTokenIndex',
      outputs: [{ internalType: 'bytes32', name: 'messageId_', type: 'bytes32' }],
      stateMutability: 'payable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint16', name: 'recipientChain', type: 'uint16' },
        { internalType: 'bytes', name: 'transceiverInstructions', type: 'bytes' },
      ],
      name: 'quoteDeliveryPrice',
      outputs: [
        { internalType: 'uint256[]', name: '', type: 'uint256[]' },
        { internalType: 'uint256', name: '', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const;

  const portal = getContract({
    address: HUB_PORTAL,
    abi,
    client: options.evmClient,
  });

  // Get bridge price quote
  // an empty bytes string of length 1 was taken from the scripts in the m-portal repo
  const [, quote] = await portal.read.quoteDeliveryPrice([
    1,
    ('0x' + Buffer.from([0]).toString('hex')) as `0x${string}`,
  ]);

  // Send index update transaction
  const refundAddress = ('0x' + options.evmClient.account?.address.slice(2).padStart(64, '0')) as `0x${string}`;

  const params = {
    wormholeDestinationChainId: 1,
    refundAddress,
    ethereumAccount: options.evmClient.account?.address,
    ethereumChain: options.evmClient.chain,
    value: quote.toString(),
  };
  if (options.dryRun) {
    logger.debug('Bridge transaction params: ', params);
  } else {
    const tx = await portal.write.sendMTokenIndex([1, refundAddress], {
      account: options.evmClient.account ?? null,
      chain: options.evmClient.chain ?? null,
      value: quote,
    });

    logger.info('Transaction sent', {
      tx: tx,
    });

    return tx;
  }

  return '';
}

// do not run the cli if this is being imported by jest
if (!process.argv[1].endsWith('jest')) {
  indexCLI()
    .catch((error) => {
      logger.error(error);
      slackMessage.level = 'error';
      slackMessage.messages.push(`${error}`);
    })
    .finally(async () => {
      if (slackMessage.messages.length === 0) {
        slackMessage.messages.push('No actions taken');
      }
      await logger.flush();
      await sendSlackMessage(slackMessage);
      process.exit(0);
    });
}
