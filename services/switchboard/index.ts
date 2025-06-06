import { Command } from 'commander';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as sb from '@switchboard-xyz/on-demand';
import { CrossbarClient, decodeString, OracleJob } from '@switchboard-xyz/common';

// Fetch data from multiple RPCs for increased security
const RPCS = ['https://eth.llamarpc.com', 'https://ethereum-rpc.publicnode.com'];

(async function main() {
  const program = new Command();
  const connection = new Connection(process.env.RPC_URL!, { commitment: 'confirmed' });
  const keypair = Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env.PAYER_KEYPAIR!)));

  program.command('simulate-jobs').action(async () => {
    const jobs = buildJobs();

    // Serialize the jobs to base64 strings.
    const serializedJobs = jobs.map((oracleJob) => {
      const encoded = OracleJob.encodeDelimited(oracleJob).finish();
      const base64 = Buffer.from(encoded).toString('base64');
      return base64;
    });

    // Call the simulation server.
    const response = await fetch('https://api.switchboard.xyz/api/simulate', {
      method: 'POST',
      headers: [['Content-Type', 'application/json']],
      body: JSON.stringify({ cluster: 'Mainnet', jobs: serializedJobs }),
    });

    // Check response.
    if (response.ok) {
      const data = await response.json();
      console.log(`Response is good (${response.status})`);
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`Response is bad (${response.status})`);
      console.log(await response.text());
    }
  });

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
    console.log(`Feed hash: ${config.feedHash.toString('hex')}`);
  });

  program.command('update-feed').action(async () => {
    const program = await sb.AnchorUtils.loadProgramFromConnection(connection);
    const pullFeed = new sb.PullFeed(program!, process.env.SWITCHBOARD_PULL_FEED!);

    const queueAccount = await sb.getDefaultQueue(connection.rpcEndpoint);
    const config = await buildFeedConfig(keypair.publicKey, queueAccount.pubkey, process.env.SWITCHBOARD_FEED_HASH);

    const [pullIx, _resp, _ok, luts] = await pullFeed.fetchUpdateIx(config as any, false, keypair.publicKey);

    const tx = await sb.asV0Tx({
      connection,
      ixs: [...pullIx!],
      signers: [keypair],
      computeUnitPrice: 150_000,
      computeUnitLimitMultiple: 1.2,
      lookupTables: luts,
      payer: keypair.publicKey,
    });

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
    hash = (await crossbarClient.store(queue.toString(), buildJobs())).feedHash;
  }

  return {
    name: 'M0 Earner Rate', // the feed name (max 32 bytes)
    queue, // the queue of oracles to bind to
    maxVariance: 0, // allowed variance between submissions and jobs
    minResponses: RPCS.length, // require response from all RPCs
    numSignatures: 3, // number of signatures to fetch per update
    minSampleSize: 1, // minimum number of responses to sample for a result
    maxStaleness: 750, // maximum stale slots of responses to sample
    feedHash: decodeString(hash)!, // feed configs on IPFS
    payer,
  };
}

function buildJobs(): OracleJob[] {
  return RPCS.map((rpc) => buildJob(rpc));
}

function buildJob(rpc: string): OracleJob {
  const jobConfig = {
    tasks: [
      {
        cacheTask: {
          cacheItems: [
            {
              variableName: 'RATE',
              job: {
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
                            data: '0xc23465b3',
                          },
                          'latest',
                        ],
                        id: 1,
                      }),
                    },
                  },
                  {
                    regexExtractTask: {
                      pattern: '0x[0-9a-fA-F]*',
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      {
        valueTask: {
          hex: '${RATE}',
        },
      },
    ],
  };
  return OracleJob.fromObject(jobConfig);
}
