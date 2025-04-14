import { AnchorProvider, BN, Program, Wallet } from '@coral-xyz/anchor';
import {
  Connection,
  Context,
  Keypair,
  Logs,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { createPublicClient, createTestClient, http } from '../../sdk/src';
import * as spl from '@solana/spl-token';
import { loadKeypair } from '../test-utils';
import { MerkleTree } from '../../sdk/src/merkle';
import { PROGRAM_ID as EARN_PROGRAM, EXT_PROGRAM_ID } from '../../sdk/src';
import { Graph } from '../../sdk/src/graph';
import EarnAuthority from '../../sdk/src/earn_auth';
import { EarnManager } from '../../sdk/src/earn_manager';
import { Earner } from '../../sdk/src/earner';
import nock from 'nock';
import { Earn } from '../../sdk/src/idl/earn';
import { ExtEarn } from '../../sdk/src/idl/ext_earn';
const EARN_IDL = require('../../sdk/src/idl/earn.json');
const EXT_EARN_IDL = require('../../sdk/src/idl/ext_earn.json');

const GRAPH_KEY = '';
const GRAPH_URL = 'https://gateway.thegraph.com/api/subgraphs/id/Exir1TE2og5jCPjAM5485NTHtgT6oAEHTevYhvpU8UFL';

describe('SDK unit tests', () => {
  const signer = loadKeypair('tests/keys/user.json');
  const mints = [loadKeypair('tests/keys/mint.json'), Keypair.generate()];
  const multisig = Keypair.generate();
  const earnerA = Keypair.fromSecretKey(
    Buffer.from(
      '2305e25d783ce903d2e749424bc5b12d199d5e42a530fe7dc6d7164e567acae46e7d23dcc935c219fd993dc328bd613349402568eb7d0e97b2eea6468356e96a',
      'hex',
    ),
  );
  const earnerB = Keypair.fromSecretKey(
    Buffer.from(
      'a7f1636a4b0de8f7c29f13d6a1c5fbedc0c5c1756351c83ddcacc4579ab4e506ae251fd85674666b7700a18749dfa153dc3d823bfc9582cdac1078aa8778fd24',
      'hex',
    ),
  );
  const earnerC = Keypair.generate();
  let earnerAccountA: PublicKey, earnerAccountB: PublicKey;

  mockSubgraph();
  const connection = new Connection('http://localhost:8899', 'processed');
  const provider = new AnchorProvider(connection, new Wallet(signer), { commitment: 'processed' });

  // anchor client for setting up the programs
  const earn = new Program<Earn>(EARN_IDL, EARN_PROGRAM, provider);
  const extEarn = new Program<ExtEarn>(EXT_EARN_IDL, EXT_PROGRAM_ID, provider);

  const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], earn.programId);
  const [extGlobalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], extEarn.programId);
  const [tokenAuth] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], earn.programId);

  // use local EVM testnet (anvil)
  const evmClient = createPublicClient({ transport: http('http://localhost:8545') });

  // change the timestamp and latest index on EVM to have deterministic results in the tests
  const testClient = createTestClient({ mode: 'anvil', transport: http('http://localhost:8545') });

  const setIndex = async (index: BN, timestamp: BN) => {
    // Slot 0 on the M Token stores three values:
    // 1. latestIndex (16 bytes)
    // 2. latestRate (4 bytes)
    // 3. latestUpdateTimeStamp (5 bytes)

    const slot: `0x${string}` = ('0x' + new BN(0).toString('hex').padStart(64, '0')) as `0x${string}`;

    // Get the current value of the slot
    const currentValue =
      (await evmClient.getStorageAt({
        address: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
        slot,
      })) ?? slot; // fallback to 0 value if not found, we use the slot variable here for convenience since it is that value

    const latestRate = currentValue.slice(32, 40);

    // Construct the new value and set it
    const newIndex = index.toString('hex').padStart(32, '0');
    const newTimestamp = timestamp.toString('hex').padStart(24, '0');

    const newValue = ('0x' + newTimestamp + latestRate + newIndex) as `0x${string}`;

    testClient.setStorageAt({
      address: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
      index: slot,
      value: newValue,
    });
  };

  beforeAll(async () => {
    const mintATAs = [];

    // create mints
    for (const mint of mints) {
      const mintLen = spl.getMintLen([]);
      const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

      const tx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: signer.publicKey,
          newAccountPubkey: mint.publicKey,
          space: mintLen,
          lamports,
          programId: spl.TOKEN_2022_PROGRAM_ID,
        }),
        spl.createInitializeMintInstruction(mint.publicKey, 9, signer.publicKey, null, spl.TOKEN_2022_PROGRAM_ID),
      );

      await provider.sendAndConfirm(tx, [signer, mint]);

      const ataTransaction = new Transaction();

      mintATAs.push(
        [earnerA, earnerB, earnerC].map((earner) => {
          const earnerATA = spl.getAssociatedTokenAddressSync(
            mint.publicKey,
            earner.publicKey,
            true,
            spl.TOKEN_2022_PROGRAM_ID,
          );
          ataTransaction.add(
            spl.createAssociatedTokenAccountInstruction(
              signer.publicKey,
              earnerATA,
              earner.publicKey,
              mint.publicKey,
              spl.TOKEN_2022_PROGRAM_ID,
            ),
          );
          // mint some tokens to the account
          ataTransaction.add(
            spl.createMintToInstruction(
              mint.publicKey,
              earnerATA,
              signer.publicKey,
              earnerA === earner ? 5000e9 : earner === earnerB ? 3000e9 : 0,
              [],
              spl.TOKEN_2022_PROGRAM_ID,
            ),
          );
          return earnerATA;
        }),
      );

      await provider.sendAndConfirm(ataTransaction, [signer]);
    }

    // mint multisig on earn program
    const multiSigTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: signer.publicKey,
        newAccountPubkey: multisig.publicKey,
        space: spl.MULTISIG_SIZE,
        lamports: await spl.getMinimumBalanceForRentExemptMultisig(connection),
        programId: spl.TOKEN_2022_PROGRAM_ID,
      }),
      spl.createInitializeMultisigInstruction(
        multisig.publicKey,
        [signer.publicKey, tokenAuth],
        1,
        spl.TOKEN_2022_PROGRAM_ID,
      ),
      spl.createSetAuthorityInstruction(
        mints[0].publicKey,
        signer.publicKey,
        spl.AuthorityType.MintTokens,
        multisig.publicKey,
        [],
        spl.TOKEN_2022_PROGRAM_ID,
      ),
    );

    await provider.sendAndConfirm(multiSigTx, [signer, multisig]);

    // intialize the programs
    await earn.methods
      .initialize(mints[0].publicKey, signer.publicKey, new BN(1_000_000_000_000), new BN(0))
      .accounts({
        globalAccount,
        admin: signer.publicKey,
      })
      .signers([signer])
      .rpc();

    await extEarn.methods
      .initialize(signer.publicKey)
      .accounts({
        globalAccount: extGlobalAccount,
        admin: signer.publicKey,
        mMint: mints[0].publicKey,
        extMint: mints[1].publicKey,
        mEarnGlobalAccount: globalAccount,
        token2022: spl.TOKEN_2022_PROGRAM_ID,
      })
      .signers([signer])
      .rpc();

    // populate the earner merkle tree with the initial earners
    const earnerMerkleTree = new MerkleTree([earnerA.publicKey]);

    await earn.methods
      .propagateIndex(new BN(1_000_000_000_000), earnerMerkleTree.getRoot())
      .accounts({
        signer: signer.publicKey,
        globalAccount,
        mint: mints[0].publicKey,
      })
      .signers([signer])
      .rpc();

    earnerAccountA = PublicKey.findProgramAddressSync(
      [Buffer.from('earner'), mintATAs[0][0].toBytes()],
      earn.programId,
    )[0];
    earnerAccountB = PublicKey.findProgramAddressSync(
      [Buffer.from('earner'), mintATAs[1][1].toBytes()],
      extEarn.programId,
    )[0];

    // add earner from root
    await earn.methods
      .addRegistrarEarner(earnerA.publicKey, earnerMerkleTree.getInclusionProof(earnerA.publicKey).proof)
      .accounts({
        signer: signer.publicKey,
        globalAccount,
        earnerAccount: earnerAccountA,
        userTokenAccount: mintATAs[0][0],
      })
      .rpc();

    // add manager
    const [earnManagerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('earn_manager'), signer.publicKey.toBytes()],
      extEarn.programId,
    );

    await extEarn.methods
      .addEarnManager(signer.publicKey, new BN(10))
      .accounts({
        admin: signer.publicKey,
        globalAccount: extGlobalAccount,
        earnManagerAccount,
        feeTokenAccount: mintATAs[1][0],
      })
      .rpc();

    await extEarn.methods
      .addEarner(earnerB.publicKey)
      .accounts({
        signer: signer.publicKey,
        globalAccount: extGlobalAccount,
        earnerAccount: earnerAccountB,
        userTokenAccount: mintATAs[1][1],
        earnManagerAccount,
      })
      .rpc();

    await earn.methods
      .propagateIndex(new BN(1_010_000_000_000), earnerMerkleTree.getRoot())
      .accounts({
        signer: signer.publicKey,
        globalAccount,
        mint: mints[0].publicKey,
      })
      .signers([signer])
      .rpc();

    await extEarn.methods
      .sync()
      .accounts({
        globalAccount: extGlobalAccount,
        mEarnGlobalAccount: globalAccount,
        earnAuthority: signer.publicKey,
      })
      .signers([signer])
      .rpc();
  }, 15_000);

  describe('rpc', () => {
    test('get all earners', async () => {
      for (const [index, earner] of [earnerA, earnerB].entries()) {
        const auth = await EarnAuthority.load(
          connection,
          evmClient,
          GRAPH_KEY,
          index === 0 ? EARN_PROGRAM : EXT_PROGRAM_ID,
        );
        const earners = await auth.getAllEarners();
        expect(earners).toHaveLength(1);
        expect(earners[0].data.user.toBase58()).toEqual(earner.publicKey.toBase58());
      }
    });

    test('get earn manager', async () => {
      const manager = await EarnManager.fromManagerAddress(connection, evmClient, GRAPH_KEY, signer.publicKey);
      expect(manager.data.feeBps.toNumber()).toEqual(10);
    });

    test('manager earners', async () => {
      const manager = await EarnManager.fromManagerAddress(connection, evmClient, GRAPH_KEY, signer.publicKey);
      const earners = await manager.getEarners();
      expect(earners).toHaveLength(1);
      expect(earners[0].data.user.toBase58()).toEqual(earnerB.publicKey.toBase58());
    });
  });

  describe('subgraph', () => {
    test('token holders', async () => {
      const graph = new Graph(GRAPH_KEY);
      const accounts = await graph.getTokenAccounts(3);
      expect(accounts).toHaveLength(3);
    });

    test('weighted balance', async () => {
      const graph = new Graph(GRAPH_KEY);
      const balance = await graph.getTimeWeightedBalance(
        new PublicKey('BpBCHhfSbR368nurxPizimYEr55JE7JWQ5aDQjYi3EQj'),
        new BN(0),
        new BN(1000),
      );
      expect(balance.toNumber()).toEqual(2250000000000);
    });

    describe('weighted balance calculations', () => {
      // grab private function
      const fn = Graph['calculateTimeWeightedBalance'];

      test('0 balance', async () => {
        expect(fn(new BN(0), new BN(0), new BN(1741939199), []).toNumber()).toEqual(0);
      });
      test('no transfers balance', async () => {
        expect(fn(new BN(110), new BN(0), new BN(1741939199), []).toNumber()).toEqual(110);
      });
      test('one transfers halfway', async () => {
        expect(fn(new BN(100), new BN(50), new BN(150), [{ amount: '50', ts: '100' }]).toNumber()).toEqual(75);
      });
      test('huge transfer before calculation', async () => {
        expect(
          fn(new BN(1000000), new BN(100), new BN(1500000), [{ amount: '1000000', ts: '1499995' }]).toNumber(),
        ).toEqual(3);
      });
      test('many transfers', async () => {
        const numTransfers = 50;
        const transferAmount = 10;

        // generate transfer data
        const transfers = [...Array(numTransfers)]
          .map((_, i) => ({ amount: '10', ts: (100n + BigInt(i * transferAmount)).toString() }))
          .reverse();

        const upper = new BN(transfers[0].ts).add(new BN(10));
        const lower = new BN(transfers[transfers.length - 1].ts).sub(new BN(10));

        // expect balance based on linear distribution of transfers
        const expected = 1000 - (numTransfers * transferAmount) / 2;
        expect(fn(new BN(1000), lower, upper, transfers).toNumber()).toEqual(expected);
      });
      test('current balance is 0', async () => {
        expect(fn(new BN(0), new BN(100), new BN(200), [{ amount: '-1000', ts: '150' }]).toNumber()).toEqual(500);
      });
    });
  });

  describe('earn authority', () => {
    test('pre claim cycle validation', async () => {
      const global = await earn.account.global.fetch(globalAccount, 'processed');
      expect(global.maxSupply.toString()).toEqual('8000000000000');
      expect(global.maxYield.toString()).toEqual('80000000000');
      expect(global.distributed.toString()).toEqual('0');
    });

    const claimIxs: TransactionInstruction[] = [];

    test('build claims', async () => {
      const auth = await EarnAuthority.load(connection, evmClient, GRAPH_KEY);
      const earners = await auth.getAllEarners();

      for (const earner of earners) {
        // earner.data.lastClaimTimestamp = auth['global'].timestamp;
        const ix = await auth.buildClaimInstruction(earner);
        claimIxs.push(ix!);
      }
    });

    test('validate claims and send', async () => {
      const auth = await EarnAuthority.load(connection, evmClient, GRAPH_KEY);
      expect(auth['global'].distributed!.toNumber()).toBe(0);

      // will throw on simulation or validation errors
      const [ixs, amount] = await auth.simulateAndValidateClaimIxs(claimIxs);
      expect(ixs).toHaveLength(1);
      expect(amount.toNumber()).toEqual(50000000000);

      const logWaiter = new Promise((resolve: (value: void) => void, reject) => {
        const timeout = setTimeout(() => {
          provider.connection.removeOnLogsListener(logsID);
          reject('did not see rewards log');
        }, 2000);

        // validate logs parser on SDK
        const logsID = provider.connection.onLogs(
          new PublicKey('3ojLwYogY9x64HvxACRZ4awjGonUYBTGefFp56mkfxVs'),
          (logs: Logs, _: Context) => {
            const rewards = auth['_getRewardAmounts'](logs.logs);
            expect(rewards?.[0].user.toString()).toEqual('50000000000');
            provider.connection.removeOnLogsListener(logsID);
            clearTimeout(timeout);
            resolve();
          },
          'processed',
        );
      });

      // send transactions
      await sendAndConfirmTransaction(connection, new Transaction().add(...claimIxs), [signer]);

      await auth.refresh();
      expect(auth['global'].distributed!.toNumber()).toBe(50000000000);

      await logWaiter;
    });

    test('post claim cycle validation', async () => {
      const global = await earn.account.global.fetch(globalAccount, 'processed');
      expect(global.maxSupply.toString()).toEqual('8000000000000');
      expect(global.maxYield.toString()).toEqual('80000000000');
      expect(global.distributed.toString()).toEqual('50000000000');
      expect(global.claimComplete).toBeFalsy();
    });

    test('set claim cycle complete', async () => {
      const auth = await EarnAuthority.load(connection, evmClient, GRAPH_KEY);
      const ix = await auth.buildCompleteClaimCycleInstruction();
      await sendAndConfirmTransaction(connection, new Transaction().add(ix!), [signer]);

      await auth.refresh();
      expect(auth['global'].claimComplete).toBeTruthy();
      expect(auth['global'].distributed!.toString()).toEqual('50000000000');
      expect(auth['global'].claimComplete).toBeTruthy();
    });
  });

  describe('earn manager', () => {
    test('configure', async () => {
      const manager = await EarnManager.fromManagerAddress(connection, evmClient, GRAPH_KEY, signer.publicKey);

      const dummyATA = spl.getAssociatedTokenAddressSync(
        mints[1].publicKey,
        earnerA.publicKey,
        true,
        spl.TOKEN_2022_PROGRAM_ID,
      );

      const ix = await manager.buildConfigureInstruction(15, dummyATA);
      await sendAndConfirmTransaction(connection, new Transaction().add(ix), [signer]);
      await manager.refresh();

      expect(manager.data.feeBps.toNumber()).toEqual(15);
    });

    test('add earner', async () => {
      const manager = await EarnManager.fromManagerAddress(connection, evmClient, GRAPH_KEY, signer.publicKey);

      const earnerATA = spl.getAssociatedTokenAddressSync(
        mints[1].publicKey,
        earnerC.publicKey,
        true,
        spl.TOKEN_2022_PROGRAM_ID,
      );

      const ixs = await manager.buildAddEarnerInstruction(earnerC.publicKey, earnerATA);
      await sendAndConfirmTransaction(connection, new Transaction().add(...ixs), [signer]);

      const earner = await Earner.fromTokenAccount(connection, evmClient, GRAPH_KEY, earnerATA);
      expect(earner.data.earnManager?.toBase58()).toEqual(manager.manager.toBase58());
    });
  });

  describe('earner', () => {
    describe('getClaimedYield', () => {
      test('earn program', async () => {
        const earnerATA = spl.getAssociatedTokenAddressSync(
          mints[0].publicKey,
          earnerA.publicKey,
          false,
          spl.TOKEN_2022_PROGRAM_ID,
        );

        const earner = await Earner.fromTokenAccount(connection, evmClient, GRAPH_KEY, earnerATA, EARN_PROGRAM);
        const claimed = await earner.getClaimedYield();
        expect(claimed.toString()).toEqual('9000000');
      });

      test('ext earn program', async () => {
        const earnerATA = spl.getAssociatedTokenAddressSync(
          mints[1].publicKey,
          earnerB.publicKey,
          false,
          spl.TOKEN_2022_PROGRAM_ID,
        );

        const earner = await Earner.fromTokenAccount(connection, evmClient, GRAPH_KEY, earnerATA, EXT_PROGRAM_ID);
        const claimed = await earner.getClaimedYield();
        expect(claimed.toString()).toEqual('5000000');
      });
    });

    describe('getPendingYield', () => {
      beforeAll(async () => {
        // Set a later index on the EVM contract so that there is some pending yield
        await setIndex(new BN(1_020_100_000_000), new BN((await evmClient.getBlock()).timestamp.toString()));
      });

      test('earn program', async () => {
        const earnerATA = spl.getAssociatedTokenAddressSync(
          mints[0].publicKey,
          earnerA.publicKey,
          false,
          spl.TOKEN_2022_PROGRAM_ID,
        );

        const earner = await Earner.fromTokenAccount(connection, evmClient, GRAPH_KEY, earnerATA, EARN_PROGRAM);
        const pending = await earner.getPendingYield();

        // Earner's weighted balance over the period is 5,000,000 M
        // The index is increased by 1% since their last claim
        // Therefore, the pending yield should be 50,000 M
        expect(pending.toString()).toEqual('50000000000'.toString());
      });

      test('ext earn program - with manager fee', async () => {
        const earnerATA = spl.getAssociatedTokenAddressSync(
          mints[1].publicKey,
          earnerB.publicKey,
          false,
          spl.TOKEN_2022_PROGRAM_ID,
        );

        const earner = await Earner.fromTokenAccount(connection, evmClient, GRAPH_KEY, earnerATA, EXT_PROGRAM_ID);
        const pending = await earner.getPendingYield();

        // Earners's weighted balance over the period is 2,000,000
        // The index increased by 2.01% since their last claim
        // The total pending yield is 40,200 M
        // The earn manager takes a 15 basis point fee
        // Therefore, the earner's pending yield should be 40,200 * (1 - 0.0015) = 40,139.7 M
        expect(pending.toString()).toEqual('40139700000'.toString());
      });

      test('ext earn program - no manager fee', async () => {
        // Set the earn manager to 0% fee
        const manager = await EarnManager.fromManagerAddress(connection, evmClient, GRAPH_KEY, signer.publicKey);

        const dummyATA = spl.getAssociatedTokenAddressSync(
          mints[1].publicKey,
          earnerA.publicKey,
          true,
          spl.TOKEN_2022_PROGRAM_ID,
        );

        const ix = await manager.buildConfigureInstruction(0, dummyATA);
        await sendAndConfirmTransaction(connection, new Transaction().add(ix), [signer]);

        // Get the pending yield for the earner and compare with the expected value
        const earnerATA = spl.getAssociatedTokenAddressSync(
          mints[1].publicKey,
          earnerB.publicKey,
          false,
          spl.TOKEN_2022_PROGRAM_ID,
        );

        const earner = await Earner.fromTokenAccount(connection, evmClient, GRAPH_KEY, earnerATA, EXT_PROGRAM_ID);
        const pending = await earner.getPendingYield();

        // Earner's weighted balance over the period is 2,000,000 M
        // The index increased by 2.01% since their last claim
        // The total pending yield is 40,200 M
        expect(pending.toString()).toEqual('40200000000'.toString());
      });
    });
  });
});

/*
 * Mock subgraph and rpc data for testing
 */
function mockSubgraph() {
  nock(GRAPH_URL)
    .post('', (body) => body.operationName === 'getTokenAccounts')
    .reply(200, {
      data: {
        tokenAccounts: [
          {
            pubkey: '0x2e5142a34ef98156a014e46bef3bde4ad56222945615cea479f2f183699a5bf8',
            balance: '7989730149114',
            claims: [],
          },
          {
            pubkey: '0xfa6612d18aeda9532e052a0187a4fdb08fb0d1f6495d9373ce33b7ff9253f88c',
            balance: '1334675545835',
            claims: [],
          },
          {
            pubkey: '0xca9b25a2034eaac78095a0c15fba16622ff1bc8cb6ff979ff1948ce8dd0d89e0',
            balance: '852358441083',
            claims: [],
          },
        ],
      },
    })
    .persist();

  nock(GRAPH_URL)
    .post(
      '',
      (body) =>
        body.operationName === 'getBalanceUpdates' &&
        body.variables.tokenAccountId === '0x2ee054fbeb1bcc406d5b9bf8e96a6d2da4196dedbf8181a69be92e73b5c5488f',
    )
    .reply(200, {
      data: {
        tokenAccount: {
          balance: '5000000000000',
          transfers: [],
        },
      },
    })
    .persist();

  nock(GRAPH_URL)
    .post('', (body) => body.operationName === 'getIndexUpdates')
    .reply(200, {
      data: {
        indexUpdates: [],
      },
    })
    .persist();

  nock(GRAPH_URL)
    .post(
      '',
      (body) =>
        body.operationName === 'getBalanceUpdates' &&
        body.variables.tokenAccountId !== '0x2fe054fbeb1bcc406d5b9bf8e96a6d2da4196dedbf8181a69be92e73b5c5488f',
    )
    .reply(200, {
      data: {
        tokenAccount: {
          balance: '2000000000000',
          transfers: [
            {
              amount: '-1000000000000',
              ts: '250',
            },
          ],
        },
      },
    })
    .persist();

  nock(GRAPH_URL)
    .post(
      '',
      (body) =>
        body.operationName === 'getClaimsForTokenAccount' &&
        body.variables.tokenAccountId === '0x2ee054fbeb1bcc406d5b9bf8e96a6d2da4196dedbf8181a69be92e73b5c5488f',
    )
    .reply(200, {
      data: {
        claims: [
          {
            amount: '5000000',
            ts: '100',
            signature: '0x',
            recipient_token_account: {
              pubkey: '2ee054fbeb1bcc406d5b9bf8e96a6d2da4196dedbf8181a69be92e73b5c5488f',
            },
          },
          {
            amount: '4000000',
            ts: '200',
            signature: '0x',
            recipient_token_account: {
              pubkey: '2ee054fbeb1bcc406d5b9bf8e96a6d2da4196dedbf8181a69be92e73b5c5488f',
            },
          },
        ],
      },
    });

  nock(GRAPH_URL)
    .post(
      '',
      (body) =>
        body.operationName === 'getClaimsForTokenAccount' &&
        body.variables.tokenAccountId !== '0x2ee054fbeb1bcc406d5b9bf8e96a6d2da4196dedbf8181a69be92e73b5c5488f',
    )
    .reply(200, {
      data: {
        claims: [
          {
            amount: '5000000',
            ts: '100',
            signature: '0x',
            recipient_token_account: {
              pubkey: '0xd088f35850618fd9c71c18b2c8ebcdff4dfc192bb22b64826fac4dc0136b5685',
            },
          },
        ],
      },
    });
}
