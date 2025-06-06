import { Command } from 'commander';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as sb from '@switchboard-xyz/on-demand';
import { CrossbarClient, decodeString, OracleJob } from '@switchboard-xyz/common';

(async function main() {
  const program = new Command();
  const connection = new Connection(process.env.RPC_URL!);
  const keypair = Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env.PAYER_KEYPAIR!)));

  program.command('create-feed').action(async () => {
    const program = await sb.AnchorUtils.loadProgramFromConnection(connection);

    const [pullFeed, feedKp] = sb.PullFeed.generate(program!);
    const queueAccount = await sb.getDefaultQueue(connection.rpcEndpoint);

    const config = await buildFeedConfig(keypair.publicKey, queueAccount.pubkey);

    const initTx = await sb.asV0Tx({
      connection,
      ixs: [await pullFeed.initIx(config)],
      payer: keypair.publicKey,
      signers: [keypair, feedKp],
      computeUnitPrice: 150_000,
      computeUnitLimitMultiple: 1.2,
    });

    console.log('Sending initialize transaction');
    const sig = await connection.sendTransaction(initTx);
    await connection.confirmTransaction(sig, 'confirmed');
    console.log(`Feed ${feedKp.publicKey} initialized (${sig})`);
  });

  program.command('update-feed').action(async () => {
    const program = await sb.AnchorUtils.loadProgramFromConnection(connection);
    const pullFeed = new sb.PullFeed(program!, process.env.SWITCHBOARD_PULL_FEED!);

    const queueAccount = await sb.getDefaultQueue(connection.rpcEndpoint);
    const config = await buildFeedConfig(keypair.publicKey, queueAccount.pubkey, process.env.SWITCHBOARD_FEED_HASH);

    const [pullIx, _resp, _ok, luts] = await pullFeed.fetchUpdateIx(config as any);

    const tx = await sb.asV0Tx({
      connection,
      ixs: [...pullIx!],
      signers: [keypair],
      computeUnitPrice: 150_000,
      computeUnitLimitMultiple: 1.2,
      lookupTables: luts,
    });

    console.log(Buffer.from(tx.serialize()).toString('base64'));

    const sim = await connection.simulateTransaction(tx);
    const updateEvent = new sb.PullFeedValueEvent(sb.AnchorUtils.loggedEvents(program!, sim.value.logs!)[0]).toRows();
    console.log('Submitted updates:\n', updateEvent);
    console.log(`Tx Signature: ${await connection.sendTransaction(tx)}`);
  });

  await program.parseAsync(process.argv);
})();

async function buildFeedConfig(payer: PublicKey, queue: PublicKey, feedhash?: string) {
  let hash = feedhash;
  if (!hash) {
    const crossbarClient = new CrossbarClient('https://crossbar.switchboard.xyz', true);
    const FEED_JOBS = [buildJob('earnerRate'), buildJob('latestIndex')];
    hash = (await crossbarClient.store(queue.toString(), FEED_JOBS)).feedHash;
  }

  return {
    name: 'M0 Earner Data', // the feed name (max 32 bytes)
    queue, // the queue of oracles to bind to
    maxVariance: 0, // allowed variance between submissions and jobs
    minResponses: 1, // minimum number of responses of jobs to allow
    numSignatures: 3, // number of signatures to fetch per update
    minSampleSize: 1, // minimum number of responses to sample for a result
    maxStaleness: 750, // maximum stale slots of responses to sample
    feedHash: decodeString(hash)!, // feed configs on IPFS
    payer,
  };
}

function buildJob(method: 'earnerRate' | 'latestIndex', rpc = 'https://eth.llamarpc.com'): OracleJob {
  const jobConfig = {
    tasks: [
      {
        httpTask: {
          url: rpc,
          method: 'METHOD_POST',
          headers: [{ key: 'Content-Type', value: 'application/json' }],
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [
              {
                to: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
                data: { earnerRate: '0xc23465b4', latestIndex: '0x578f2aa0' }[method],
              },
              'latest',
            ],
            id: 1,
          }),
        },
      },
      {
        jsonParseTask: {
          path: `$.result`,
        },
      },
      {
        valueTask: {
          hex: '${ONE}',
        },
      },
    ],
  };
  return OracleJob.fromObject(jobConfig);
}
