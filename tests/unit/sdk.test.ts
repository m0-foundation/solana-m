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
import { createPublicClient, createTestClient, http, MINT } from '@m0-foundation/solana-m-sdk';
import * as spl from '@solana/spl-token';
import { loadKeypair } from '../test-utils';
import { PROGRAM_ID as EARN_PROGRAM, EXT_PROGRAM_ID } from '@m0-foundation/solana-m-sdk';
import { EarnAuthority, EarnManager, Earner } from '@m0-foundation/solana-m-sdk';
import { Earn } from '@m0-foundation/solana-m-sdk/src/idl/earn';
import { ExtEarn } from '@m0-foundation/solana-m-sdk/src/idl/ext_earn';
import { MerkleTree } from '@m0-foundation/solana-m-sdk/src/merkle';
import { _calculateTimeWeightedBalance, getTimeWeightedBalance } from '@m0-foundation/solana-m-sdk/src/twb';
import nock from 'nock';
const EARN_IDL = require('@m0-foundation/solana-m-sdk/src/idl/earn.json');
const EXT_EARN_IDL = require('@m0-foundation/solana-m-sdk/src/idl/ext_earn.json');

describe('SDK unit tests', () => {
  const signer = loadKeypair('keys/user.json');
  const mints = [loadKeypair('keys/mint.json'), Keypair.generate()];
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

  mockAPI();
  const connection = new Connection('http://localhost:8899', 'processed');
  const provider = new AnchorProvider(connection, new Wallet(signer), { commitment: 'processed' });

  // anchor client for setting up the programs
  const earn = new Program<Earn>(EARN_IDL, EARN_PROGRAM, provider);
  const extEarn = new Program<ExtEarn>(EXT_EARN_IDL, EXT_PROGRAM_ID, provider);

  const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], earn.programId);
  const [extGlobalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], extEarn.programId);
  const [tokenAuth] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], earn.programId);
  const [extMintAuth] = PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], extEarn.programId);

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
        spl.createInitializeMintInstruction(mint.publicKey, 6, signer.publicKey, null, spl.TOKEN_2022_PROGRAM_ID),
      );

      await provider.sendAndConfirm(tx, [signer, mint]);
    }

    // mint M to ATAs and create wM ATAs
    const ataTransaction = new Transaction();

    mintATAs.push(
      [earnerA, earnerB, earnerC].map((earner) => {
        const earnerATA = spl.getAssociatedTokenAddressSync(
          mints[0].publicKey,
          earner.publicKey,
          true,
          spl.TOKEN_2022_PROGRAM_ID,
        );
        ataTransaction.add(
          spl.createAssociatedTokenAccountInstruction(
            signer.publicKey,
            earnerATA,
            earner.publicKey,
            mints[0].publicKey,
            spl.TOKEN_2022_PROGRAM_ID,
          ),
        );
        // mint some tokens to the account
        ataTransaction.add(
          spl.createMintToInstruction(
            mints[0].publicKey,
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

    mintATAs.push(
      [earnerA, earnerB, earnerC].map((earner) => {
        const earnerATA = spl.getAssociatedTokenAddressSync(
          mints[1].publicKey,
          earner.publicKey,
          true,
          spl.TOKEN_2022_PROGRAM_ID,
        );
        ataTransaction.add(
          spl.createAssociatedTokenAccountInstruction(
            signer.publicKey,
            earnerATA,
            earner.publicKey,
            mints[1].publicKey,
            spl.TOKEN_2022_PROGRAM_ID,
          ),
        );

        return earnerATA;
      }),
    );

    await provider.sendAndConfirm(ataTransaction, [signer]);

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

    // make the ext earn program the mint authority of the wM mint
    const extMintTx = new Transaction().add(
      spl.createSetAuthorityInstruction(
        mints[1].publicKey,
        signer.publicKey,
        spl.AuthorityType.MintTokens,
        extMintAuth,
        [],
        spl.TOKEN_2022_PROGRAM_ID,
      ),
    );

    await provider.sendAndConfirm(extMintTx, [signer]);

    // intialize the programs
    await earn.methods
      .initialize(signer.publicKey, new BN(1_000_000_000_000), new BN(0))
      .accounts({
        mint: mints[0].publicKey,
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
        const auth = await EarnAuthority.load(connection, evmClient, index === 0 ? EARN_PROGRAM : EXT_PROGRAM_ID);
        const earners = await auth.getAllEarners();
        expect(earners).toHaveLength(1);
        expect(earners[0].data.user.toBase58()).toEqual(earner.publicKey.toBase58());
      }
    });

    test('get earn manager', async () => {
      const manager = await EarnManager.fromManagerAddress(connection, evmClient, signer.publicKey);
      expect(manager.data.feeBps.toNumber()).toEqual(10);
    });

    test('manager earners', async () => {
      const manager = await EarnManager.fromManagerAddress(connection, evmClient, signer.publicKey);
      const earners = await manager.getEarners();
      expect(earners).toHaveLength(1);
      expect(earners[0].data.user.toBase58()).toEqual(earnerB.publicKey.toBase58());
    });
  });

  describe('subgraph', () => {
    test('weighted balance', async () => {
      const balance = await getTimeWeightedBalance(
        new PublicKey('BpBCHhfSbR368nurxPizimYEr55JE7JWQ5aDQjYi3EQj'),
        MINT,
        new Date(0),
        new Date(1000),
      );
      expect(balance.toNumber()).toEqual(2250000000000);
    });

    describe('weighted balance calculations', () => {
      test('0 balance', async () => {
        expect(_calculateTimeWeightedBalance(new BN(0), new BN(0), new BN(1741939199), []).toNumber()).toEqual(0);
      });
      test('no transfers balance', async () => {
        expect(_calculateTimeWeightedBalance(new BN(110), new BN(0), new BN(1741939199), []).toNumber()).toEqual(110);
      });
      test('one transfers halfway', async () => {
        expect(
          _calculateTimeWeightedBalance(new BN(100), new BN(50), new BN(150), [
            { preBalance: 50, postBalance: 100, ts: new Date(100) } as any,
          ]).toNumber(),
        ).toEqual(75);
      });
      test('huge transfer before calculation', async () => {
        expect(
          _calculateTimeWeightedBalance(new BN(1000000), new BN(100), new BN(1500000), [
            { preBalance: 0, postBalance: 1000000, ts: new Date(1499995) } as any,
          ]).toNumber(),
        ).toEqual(3);
      });
      test('many transfers', async () => {
        const numTransfers = 50;
        const transferAmount = 10;

        // generate transfer data
        const transfers = [...Array(numTransfers)]
          .map((_, i) => ({ amount: '10', ts: (100n + BigInt(i * transferAmount)).toString() } as any))
          .reverse();

        const upper = new BN(transfers[0].ts).add(new BN(10));
        const lower = new BN(transfers[transfers.length - 1].ts).sub(new BN(10));

        // expect balance based on linear distribution of transfers
        const expected = 1000 - (numTransfers * transferAmount) / 2;
        expect(_calculateTimeWeightedBalance(new BN(1000), lower, upper, transfers).toNumber()).toEqual(expected);
      });
      test('current balance is 0', async () => {
        expect(
          _calculateTimeWeightedBalance(new BN(0), new BN(100), new BN(200), [
            { preBalance: 0, postBalance: 1000, ts: new Date(150) } as any,
          ]).toNumber(),
        ).toEqual(500);
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
      const auth = await EarnAuthority.load(connection, evmClient);
      const earners = await auth.getAllEarners();

      for (const earner of earners) {
        // earner.data.lastClaimTimestamp = auth['global'].timestamp;
        const ix = await auth.buildClaimInstruction(earner);
        claimIxs.push(ix!);
      }
    });

    test('validate claims and send', async () => {
      const auth = await EarnAuthority.load(connection, evmClient);
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
      expect(global.maxSupply.toString()).toEqual('8050000000000');
      expect(global.maxYield.toString()).toEqual('80000000000');
      expect(global.distributed.toString()).toEqual('50000000000');
      expect(global.claimComplete).toBeFalsy();
    });

    test('set claim cycle complete', async () => {
      const auth = await EarnAuthority.load(connection, evmClient);
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
      const manager = await EarnManager.fromManagerAddress(connection, evmClient, signer.publicKey);

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
      const manager = await EarnManager.fromManagerAddress(connection, evmClient, signer.publicKey);

      const earnerATA = spl.getAssociatedTokenAddressSync(
        mints[1].publicKey,
        earnerC.publicKey,
        true,
        spl.TOKEN_2022_PROGRAM_ID,
      );

      const ixs = await manager.buildAddEarnerInstruction(earnerC.publicKey, earnerATA);
      await sendAndConfirmTransaction(connection, new Transaction().add(...ixs), [signer]);

      const earner = await Earner.fromTokenAccount(connection, evmClient, earnerATA);
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

        const earner = await Earner.fromTokenAccount(connection, evmClient, earnerATA, EARN_PROGRAM);
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

        const earner = await Earner.fromTokenAccount(connection, evmClient, earnerATA, EXT_PROGRAM_ID);
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

        const earner = await Earner.fromTokenAccount(connection, evmClient, earnerATA, EARN_PROGRAM);
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

        const earner = await Earner.fromTokenAccount(connection, evmClient, earnerATA, EXT_PROGRAM_ID);
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
        const manager = await EarnManager.fromManagerAddress(connection, evmClient, signer.publicKey);

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

        const earner = await Earner.fromTokenAccount(connection, evmClient, earnerATA, EXT_PROGRAM_ID);
        const pending = await earner.getPendingYield();

        // Earner's weighted balance over the period is 2,000,000 M
        // The index increased by 2.01% since their last claim
        // The total pending yield is 40,200 M
        expect(pending.toString()).toEqual('40200000000'.toString());
      });
    });
  });
});

function mockAPI() {
  process.env.LOCALNET = 'true';

  nock('http://localhost:5500')
    .get('/events/index-updates')
    .query(true)
    .reply(200, (url: any) => {
      const now = BigInt(Math.floor(Date.now() / 1000));
      const day = BigInt('86400');

      const urlParams = new URLSearchParams(url);
      const from_time = BigInt(urlParams.get('from_time') || '0');
      const to_time = BigInt(urlParams.get('from_time') || '0');

      const indexUpdates = [
        {
          index: '1000000000000',
          ts: new Date(Number(now - day * BigInt(3))).toISOString(),
          programId: '',
          signature: '',
          tokenSupply: 0,
        },
        {
          index: '1010000000000',
          ts: new Date(Number(now - day * BigInt(2))).toISOString(),
          programId: '',
          signature: '',
          tokenSupply: 0,
        },
        {
          index: '1020100000000',
          ts: new Date(Number(now - day)).toISOString(),
          programId: '',
          signature: '',
          tokenSupply: 0,
        },
      ];

      return {
        updates: indexUpdates.filter((v) => BigInt(v.index) >= from_time && BigInt(v.index) <= to_time),
      };
    })
    .persist();

  nock('http://localhost:5500')
    .get(
      '/token-account/49z9xVgJC5F45Ui3NkJGxKWH3DBzcL6wnQJS79ziQD5p/mzerokyEX9TNDoK4o2YZQBDmMzjokAeN6M2g2S3pLJo/transfers',
    )
    .query(true)
    .reply(200, (url: any) => {
      return {
        transfers: [
          {
            preBalance: 5000000000000,
            postBalance: 5000000000000,
            tokenAccount: '',
            owner: '',
            signature: '',
            ts: new Date(0).toISOString(),
          },
        ],
      };
    })
    .persist();

  nock('http://localhost:5500')
    .get(/token-account\/.*\/.*\/transfers/)
    .query(true)
    .reply(200, (url: any) => {
      return {
        transfers: [
          {
            preBalance: 1000000000000,
            postBalance: 2000000000000,
            tokenAccount: '',
            owner: '',
            signature: '',
            ts: new Date(250).toISOString(),
          },
        ],
      };
    })
    .persist();

  nock('http://localhost:5500')
    .get(
      '/token-account/49z9xVgJC5F45Ui3NkJGxKWH3DBzcL6wnQJS79ziQD5p/mzerokyEX9TNDoK4o2YZQBDmMzjokAeN6M2g2S3pLJo/claims',
    )
    .query(true)
    .reply(200, (url: any) => {
      return {
        claims: [
          {
            amount: 5000000,
            index: 1000000000000,
            programId: '',
            tokenAccount: '',
            recipientTokenAccount: '',
            signature: '',
            ts: new Date(100).toISOString(),
          },
          {
            amount: 4000000,
            index: 1010000000000,
            programId: '',
            tokenAccount: '',
            recipientTokenAccount: '',
            signature: '',
            ts: new Date(200).toISOString(),
          },
        ],
      };
    })
    .persist();

  nock('http://localhost:5500')
    .get(/token-account\/.*\/.*\/claims/)
    .query(true)
    .reply(200, (url: any) => {
      return {
        claims: [
          {
            amount: 5000000,
            index: 1000000000000,
            programId: '',
            tokenAccount: '',
            recipientTokenAccount: '',
            signature: '',
            ts: new Date(100).toISOString(),
          },
        ],
      };
    })
    .persist();
}
