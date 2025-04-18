import {
  Connection,
  GetProgramAccountsConfig,
  GetProgramAccountsResponse,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm';
import { createPublicClient, http, MINT, PROGRAM_ID, TOKEN_2022_ID, DEVNET_GRAPH_ID } from '../../sdk/src';
import { Graph } from '../../sdk/src/graph';
import EarnAuthority from '../../sdk/src/earn_auth';
import nock from 'nock';
import { TransactionMetadata } from 'litesvm';
import BN from 'bn.js';

const GRAPH_URL = 'https://gateway.thegraph.com/api/subgraphs/id/Exir1TE2og5jCPjAM5485NTHtgT6oAEHTevYhvpU8UFL';

describe('Yield calculation tests', () => {
  const svm = fromWorkspace('').withSplPrograms();
  const evmClient = createPublicClient({ transport: http('http://localhost:8545') });
  const graphClient = new Graph('', DEVNET_GRAPH_ID);
  const provider = new LiteSVMProvider(svm);
  const connection = provider.connection;

  // missing functions on litesvm connection
  connection.getProgramAccounts = getProgramAccountsFn(connection) as any;

  // Global Account
  const setGlobalAccount = (cfg: { index: bigint; ts: bigint }) => {
    let data = Buffer.from(
      'p+joschscn+z3HtcE1xihhozJWJpdvNsPnG5FAKFUFeJ7wZJIrxP9rPce1wTXGKGGjMlYml282w+cbkUAoVQV4nvBkkivE/2C4a+ZtMrxaS1qx/r30jjOwbDtaFjsZwXMO14cF9+9oyi1F1V6gAAAGcE+WcAAAAALAEAAAAAAADIQyqyAAAAAKYQEAAAAAAAAAAAAAAAAAAAworvSLaa9zZOKqEFGwy9QYBPHRQ7fiNje3tQRsh7nZ2Ejcy6QIu31s1lF6hkb3IdT4FVx4WdL0sgfT7v5zngWv4=',
      'base64',
    );

    // modify fields
    data.writeBigUInt64LE(cfg.index, 104);
    data.writeBigUInt64LE(cfg.ts, 112);

    // admin and earn auth
    data = Buffer.concat([
      data.subarray(0, 8),
      provider.wallet.publicKey.toBuffer(),
      provider.wallet.publicKey.toBuffer(),
      data.subarray(72),
    ]);

    // max yield
    data.writeBigUInt64LE(BigInt(1e12), 136);

    svm.setAccount(PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID)[0], {
      executable: false,
      owner: PROGRAM_ID,
      lamports: 2408160,
      data,
    });
  };

  // Earner Account
  const setEarnerAccount = (cfg: { lastClaimIndex: bigint; lastClaimTs: bigint }) => {
    const data = Buffer.from(
      '7H4zYC7hZ8+dP+dS6gAAAACU+GcAAAAA/1RZLpCj0IEtK6ZxLixCiIow0yZuY2CEYQkUMthQ74N5nHvdS4/LrFmS20fItLExNXj3arolk+rkdHaGjRH5iFU=',
      'base64',
    );

    // modify fields
    data.writeBigUInt64LE(cfg.lastClaimIndex, 8);
    data.writeBigUInt64LE(cfg.lastClaimTs, 16);

    svm.setAccount(new PublicKey('HQ7haiD7PAG5cEA8QE3CzcVhG68HByJxdLP7Sbp9J2Yx'), {
      executable: false,
      owner: PROGRAM_ID,
      lamports: 1510320,
      data,
    });
  };

  // Mint
  svm.setAccount(MINT, {
    executable: false,
    owner: TOKEN_2022_ID,
    lamports: 5407920,
    data: Buffer.from(
      'AQAAAAt+HmYkvrxuIRc9WMtEGFHidulJDPbDH2C3PqhmCtaMAAAAAAAAAAAGAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARIAQAB890XGpUEUSnn/t/R/PsDdmSrTBEBeq/cFh0gz/mB43wuGvmbTK8Wktasf699I4zsGw7WhY7GcFzDteHBffvaMDgBAAHz3RcalQRRKef+39H8+wN2ZKtMEQF6r9wWHSDP+YHjfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAEEAfPdFxqVBFEp5/7f0fz7A3Zkq0wRAXqv3BYdIM/5geN8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATABEBfPdFxqVBFEp5/7f0fz7A3Zkq0wRAXqv3BYdIM/5geN8Lhr5m0yvFpLWrH+vfSOM7BsO1oWOxnBcw7XhwX372jAcAAABNIGJ5IE0wAQAAAE2EAAAAaHR0cHM6Ly9naXN0Y2RuLmdpdGhhY2suY29tL1NDNFJFQ09JTi9hNzI5YWZiNzdhYTE1YTRhYTZiMWI0NmMzYWZhMWI1Mi9yYXcvMjA5ZGE1MzFlZDQ2YzFhYWVmMGIxZDNkN2I2N2IzYTVjZWMyNTdmMy9NX1N5bWJvbF81MTIuc3ZnAQAAAAMAAABldm0qAAAAMHg4NjZBMkJGNEU1NzJDYmNGMzdENTA3MUE3YTU4NTAzQmZiMzZiZTFi',
      'base64',
    ),
  });

  // Mint Mulitsig
  svm.setAccount(new PublicKey('ms2SCrTYioPuumF6oBvReXoVRizEW5qYkiVuUEak7Th'), {
    executable: false,
    owner: TOKEN_2022_ID,
    lamports: 4851120,
    data: Buffer.from(
      'AQIBhI3MukCLt9bNZReoZG9yHU+BVceFnS9LIH0+7+c54FqaouLGPcvnsHbwterjiAcIu1l2R99H2pIkxuBTYyQP/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
      'base64',
    ),
  });

  // User Token Account
  svm.setAccount(new PublicKey('BXr9Y8RarW8GhZ43Ma1vfUgm5haJVy9x2XSea9aCFSya'), {
    executable: false,
    owner: TOKEN_2022_ID,
    lamports: 2108880,
    data: Buffer.from(
      'C4a+ZtMrxaS1qx/r30jjOwbDtaFjsZwXMO14cF9+9oxUWS6Qo9CBLSumcS4sQoiKMNMmbmNghGEJFDLYUO+DecVPDwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgcAAAAPAAEAAA==',
      'base64',
    ),
  });

  describe('calculations', () => {
    // create index updates
    const indexUpdates: { ts: bigint; index: bigint }[] = [];
    for (let i = 0; i < 4; i++) {
      const ts = BigInt(i) * 10n;
      indexUpdates.push({
        ts,
        index: BigInt(Math.floor(Math.exp(0.0001 * Number(ts)) * 1e12)),
      });
    }

    // starting values and balance updates for test
    const testConfig = {
      indexUpdates,
      balanceUpdates: [
        { ts: 25n, amount: 250000000n },
        { ts: 55n, amount: -250000000n },
        { ts: 85n, amount: 250000000n },
        { ts: 95n, amount: 250000000n },
      ],
      startingBalance: 1000000000n,
      expectedReward: new BN(2879439),
      expectedTolerance: new BN(2),
    };

    // each test is an array of indexes where claims are made
    const tests = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
      [0, 1, 2, 3, 18],
      [0, 1, 2, 18],
      [0, 1, 18],
      [0, 18],
      [18],
      [17, 18],
      [16, 17, 18],
      [15, 16, 17, 18],
      [0, 2, 4, 6, 8, 10, 12, 14, 16, 18],
      [1, 3, 5, 7, 9, 11, 13, 15, 17, 18],
      [1, 3, 5, 15, 18],
      [1, 4, 6, 15, 18],
      [7, 11, 14],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18],
      [0, 15, 18],
    ];

    for (const [i, testCase] of tests.entries()) {
      test(`test case ${i + 1}`, async () => {
        const startValues = testConfig.indexUpdates[0];
        const indexUpdates = testConfig.indexUpdates.slice(1);

        // starting values for the test
        setGlobalAccount({ index: startValues.index, ts: startValues.ts });
        setEarnerAccount({ lastClaimIndex: startValues.index, lastClaimTs: startValues.ts });

        // cache balance updates so we can update them on each iteration where there is a claim
        const balanceUpdates = testConfig.balanceUpdates.slice(0);

        // sum of total rewards issued to earner
        let totalRewards = new BN(0);

        let lastClaim = 0;

        // go through all index updates
        for (const [j, update] of indexUpdates.entries()) {
          // sync update
          setGlobalAccount({ index: update.index, ts: update.ts });

          // skip claim on this index update
          // always claim on last index update so tests end on a claim
          if (!testCase.includes(j) && j !== indexUpdates.length - 1) {
            continue;
          }

          const lastClaimTs = testConfig.indexUpdates[lastClaim].ts;

          // set balance updates on mocked subgraph for this iteration
          const startingBalance = balanceUpdates
            .filter((b) => b.ts <= lastClaimTs)
            .reduce((a, b) => a + b.amount, testConfig.startingBalance);
          const filteredUpdates = balanceUpdates.filter((b) => b.ts > lastClaimTs && b.ts < update.ts);
          mockSubgraphBalances(startingBalance, filteredUpdates);

          // set index updates on mocked subgraph
          mockSubgraphIndexUpdates(testConfig.indexUpdates.slice(lastClaim, j + 2));

          // build claim for earner
          const auth = await EarnAuthority.load(connection, evmClient, graphClient);
          const earner = (await auth.getAllEarners())[0];
          console.log('earner', earner);
          const ix = await auth.buildClaimInstruction(earner);
          console.log('ix', ix);
          // build transaction
          const tx = new Transaction().add(ix!);
          tx.feePayer = provider.wallet.publicKey;
          tx.recentBlockhash = svm.latestBlockhash();
          tx.sign(provider.wallet.payer);
          console.log('tx', tx);

          // send txn and parse logs for rewards amount
          const result = svm.sendTransaction(tx) as TransactionMetadata;
          const rewards = auth['_getRewardAmounts'](result.logs())[0].user;

          totalRewards = totalRewards.add(rewards);

          // Update the index of the last claim in the overall index updates list
          // to mock the response properly
          lastClaim = j + 1;

          // Push a balance update with the reward amount to compound in the next iterations
          balanceUpdates.push({
            ts: update.ts,
            amount: BigInt(rewards.toString()),
          });
          balanceUpdates.sort((a, b) => (a.ts > b.ts ? 1 : -1));

          // console.log(
          //   `Case: ${i} | Update: ${j + 1} | Index ${update.index} | Earner LCI: ${
          //     earner.data.lastClaimIndex
          //   } | Claimed: ${rewards.toString()} | Total: ${totalRewards.toString()}`,
          // );
          svm.expireBlockhash();

          nock.cleanAll();
        }

        // console.log(`Case: ${i} | Total rewards: ${totalRewards.toString()}`);

        // validate total rewards distributed within tolerance
        if (
          !totalRewards.gte(testConfig.expectedReward.sub(testConfig.expectedTolerance)) ||
          !totalRewards.lte(testConfig.expectedReward.add(testConfig.expectedTolerance))
        ) {
          throw Error(`Expected reward: ${testConfig.expectedReward}, got: ${totalRewards}`);
        }
      });
    }
  });
});

function mockSubgraphBalances(
  startingBalance: bigint,
  balanceUpdates: {
    ts: bigint;
    amount: bigint;
  }[],
) {
  // work backwards to get final balance
  let balance = startingBalance;
  for (const update of balanceUpdates) {
    balance += update.amount;
  }

  nock(GRAPH_URL)
    .post('', (body) => body.operationName === 'getBalanceUpdates')
    .reply(200, (_: any, requestBody: { variables: { lowerTS: string; upperTS: string } }) => {
      const lowerTS = BigInt(requestBody.variables.lowerTS);
      const upperTS = BigInt(requestBody.variables.upperTS);

      return {
        data: {
          tokenAccount: {
            balance: balanceUpdates
              .filter((u) => u.ts < lowerTS)
              .reduce((a, b) => a + b.amount, startingBalance)
              .toString(),
            transfers: balanceUpdates
              .filter((u) => u.ts >= lowerTS && u.ts < upperTS)
              .map((update) => ({
                amount: update.amount.toString(),
                ts: update.ts.toString(),
              })),
          },
        },
      };
    })
    .persist();
}

function mockSubgraphIndexUpdates(
  indexUpdates: {
    index: bigint;
    ts: bigint;
  }[],
) {
  nock(GRAPH_URL)
    .post('', (body) => body.operationName === 'getIndexUpdates')
    .reply(200, {
      data: {
        indexUpdates: indexUpdates.map((update) => ({
          index: update.index.toString(),
          ts: update.ts.toString(),
        })),
      },
    })
    .persist();
}

function getProgramAccountsFn(connection: Connection) {
  return async (pID: PublicKey, config: GetProgramAccountsConfig): Promise<GetProgramAccountsResponse> => {
    // earners
    if ((config as any)?.filters?.[0].memcmp?.bytes === 'gZH8R1wytJi') {
      return [
        {
          account: (await connection.getAccountInfo(new PublicKey('HQ7haiD7PAG5cEA8QE3CzcVhG68HByJxdLP7Sbp9J2Yx')))!,
          pubkey: new PublicKey('HQ7haiD7PAG5cEA8QE3CzcVhG68HByJxdLP7Sbp9J2Yx'),
        },
      ];
    }
    return [];
  };
}
