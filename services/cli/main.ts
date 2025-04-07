import { Command } from 'commander';
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  AuthorityType,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  createInitializeTransferHookInstruction,
  createMultisig,
  createSetAuthorityInstruction,
  ExtensionType,
  getAssociatedTokenAddressSync,
  getMintLen,
  getOrCreateAssociatedTokenAccount,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
} from '@solana/spl-token';
import {
  createInitializeInstruction,
  createUpdateFieldInstruction,
  pack,
  TokenMetadata,
} from '@solana/spl-token-metadata';
import { Chain, ChainAddress, UniversalAddress, assertChain, signSendWait } from '@wormhole-foundation/sdk';
import { createPublicClient, EXT_GLOBAL_ACCOUNT, EXT_MINT, http } from '../../sdk/src';

import { createSetEvmAddresses } from '../../tests/test-utils';
import { createInitializeConfidentialTransferMintInstruction } from './confidential-transfers';
import { Program, BN } from '@coral-xyz/anchor';
import * as multisig from '@sqds/multisig';
import { Earn } from '../../target/types/earn';
import { ExtEarn } from '../../target/types/ext_earn';
import { anchorProvider, keysFromEnv, NttManager } from './utils';
import { MerkleTree } from '../../sdk/src/merkle';
import { EvmCaller } from '../../sdk/src/evm_caller';
import { EXT_PROGRAM_ID, PROGRAM_ID } from '../../sdk/src';
import { EarnManager } from '../../sdk/src/earn_manager';
const EARN_IDL = require('../../target/idl/earn.json');
const EXT_EARN_IDL = require('../../target/idl/ext_earn.json');

const PROGRAMS = {
  // program id the same for devnet and mainnet
  portal: new PublicKey('mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY'),
  earn: PROGRAM_ID,
  extEarn: EXT_PROGRAM_ID,
  // addresses the same across L2s
  evmTransiever: '0x0763196A091575adF99e2306E5e90E0Be5154841',
  evmPeer: '0xD925C84b55E4e44a53749fF5F2a5A13F63D128fd',
  // destination tokens
  mToken: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
  wmToken: '0x437cc33344a0B27A429f795ff6B469C72698B291',
};

const RATE_LIMITS_24 = {
  inbound: 100000000_000000n, // $ 100MM
  outbound: 100000000_000000n, // $ 100MM
};

async function main() {
  const program = new Command();
  const connection = new Connection(process.env.RPC_URL ?? '');
  const evmClient = createPublicClient({ transport: http(process.env.ETH_RPC_URL ?? '') });

  program
    .command('print-addresses')
    .description('Print the addresses of all the relevant programs and accounts')
    .action(() => {
      const [mMint, wmMint, multisig] = keysFromEnv(['M_MINT_KEYPAIR', 'WM_MINT_KEYPAIR', 'M_MINT_MULTISIG_KEYPAIR']);
      const [portalTokenAuthPda] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAMS.portal);
      const [earnTokenAuthPda] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAMS.earn);
      const [mVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], PROGRAMS.extEarn);
      const [mintAuthPda] = PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], PROGRAMS.extEarn);

      const addresses = {
        'Portal Program': PROGRAMS.portal,
        'Earn Program': PROGRAMS.earn,
        'ExtEarn Program': PROGRAMS.extEarn,
        'M Mint': mMint.publicKey,
        'M Mint Multisig': multisig.publicKey,
        'Portal Token Authority': portalTokenAuthPda,
        'Earn Token Authority': earnTokenAuthPda,
        'wM Mint': wmMint.publicKey,
        'ExtEarn M Vault': mVaultPda,
        'ExtEarn Mint Authority': mintAuthPda,
      };

      const tableData = Object.entries(addresses).map(([name, pubkey]) => ({
        Name: name,
        Address: pubkey.toBase58(),
        Hex: `0x${pubkey.toBuffer().toString('hex')}`,
      }));

      console.table(tableData);
    });

  program
    .command('create-multisig')
    .description('Create multisig for the mint authority')
    .action(async () => {
      const [owner, multisig] = keysFromEnv(['OWNER_KEYPAIR', 'M_MINT_MULTISIG_KEYPAIR']);

      // token authorities for both programs
      const [tokenAuthPortal] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAMS.portal);
      const [tokenAuthEarn] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], PROGRAMS.earn);

      await createMultisig(
        connection,
        owner,
        [tokenAuthPortal, tokenAuthEarn],
        1,
        multisig,
        undefined,
        TOKEN_2022_PROGRAM_ID,
      );

      console.log(`Multisig created: ${multisig.publicKey.toBase58()}`);
    });

  program
    .command('create-m-mint')
    .description('Create a new Token2022 mint for the M token')
    .option('-o, --owner [pubkey]', 'Authority on the mint')
    .action(async ({ owner }) => {
      const [payer, mint, multisig] = keysFromEnv(['OWNER_KEYPAIR', 'M_MINT_KEYPAIR', 'M_MINT_MULTISIG_KEYPAIR']);

      let authority = payer.publicKey;
      if (owner) {
        authority = new PublicKey(owner);
      }

      await createToken2022Mint(
        connection,
        payer,
        authority,
        mint,
        multisig.publicKey,
        null, // no freeze authority
        'M by M^0',
        'M',
        'https://media.m0.org/logos/svg/M_Symbol_512.svg',
        PROGRAMS.mToken,
      );
      console.log(`M Mint created: ${mint.publicKey.toBase58()}`);
    });

  program
    .command('create-wm-mint')
    .description('Create a new Token2022 mint for the Wrapped M token')
    .option('-o, --owner [pubkey]', 'Authority on the mint')
    .argument('freeze authority', 'The freeze authority for the mint (pubkey)')
    .action(async (freezeAuth: string, { owner }) => {
      const [payer, mint] = keysFromEnv(['OWNER_KEYPAIR', 'WM_MINT_KEYPAIR']);

      let authority = payer.publicKey;
      if (owner) {
        authority = new PublicKey(owner);
      }

      const mintAuthority = PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], PROGRAMS.extEarn)[0];
      const freezeAuthority = new PublicKey(freezeAuth);

      await createToken2022Mint(
        connection,
        payer,
        authority,
        mint,
        mintAuthority,
        freezeAuthority,
        'WrappedM by M^0',
        'wM',
        'https://media.m0.org/logos/svg/wM_Symbol_512.svg',
        PROGRAMS.wmToken,
      );
      console.log(`wM Mint created: ${mint.publicKey.toBase58()}`);
    });

  program
    .command('initialize-portal')
    .description('Initialize the portal program')
    .action(async () => {
      const [owner, mint, multisig] = keysFromEnv(['OWNER_KEYPAIR', 'M_MINT_KEYPAIR', 'MULTISIG_KEYPAIR']);

      const { ctx, ntt, sender, signer } = NttManager(connection, owner, mint.publicKey);

      const initTxs = ntt.initialize(sender, {
        mint: mint.publicKey,
        outboundLimit: RATE_LIMITS_24.outbound,
        mode: 'burning',
        multisig: multisig.publicKey,
      });

      await signSendWait(ctx, initTxs, signer);
      console.log(`Portal initialized: ${PROGRAMS.portal.toBase58()}`);
    });

  program
    .command('initialize-earn')
    .description('Initialize the earn program')
    .option('-s, --squadsEarnAuth [bool]', 'Set the earn authority to the squads vault', false)
    .action(async ({ squadsEarnAuth }) => {
      const [owner, mint] = keysFromEnv(['OWNER_KEYPAIR', 'M_MINT_KEYPAIR']);

      const earn = new Program<Earn>(EARN_IDL, PROGRAMS.earn, anchorProvider(connection, owner));
      const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.earn);

      let earnAuth = owner.publicKey;

      if (squadsEarnAuth) {
        earnAuth = multisig.getVaultPda({
          multisigPda: new PublicKey(process.env.SQUADS_MULTISIG_PDA ?? ''),
          index: 0,
        })[0];
      }

      await earn.methods
        .initialize(
          mint.publicKey,
          earnAuth,
          new BN(1001886486057), // initial index // TODO programmatically get from mainnet at deployment time
          new BN(5 * 60), // cooldown
        )
        .accounts({
          globalAccount,
          admin: owner.publicKey,
        })
        .signers([owner])
        .rpc();
    });

  program
    .command('initialize-ext-earn')
    .description('Initialize the extension earn program')
    .option('-s, --squadsEarnAuth [bool]', 'Set the earn authority to the squads vault', false)
    .action(async ({ squadsEarnAuth }) => {
      const [owner, mMint, wmMint] = keysFromEnv(['OWNER_KEYPAIR', 'M_MINT_KEYPAIR', 'WM_MINT_KEYPAIR']);

      const extEarn = new Program<ExtEarn>(EXT_EARN_IDL, PROGRAMS.extEarn, anchorProvider(connection, owner));
      const [earnGlobalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.earn);
      const [extGlobalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.extEarn);

      let earnAuth = owner.publicKey;

      if (squadsEarnAuth) {
        earnAuth = multisig.getVaultPda({
          multisigPda: new PublicKey(process.env.SQUADS_MULTISIG_PDA ?? ''),
          index: 0,
        })[0];
      }

      await extEarn.methods
        .initialize(earnAuth)
        .accounts({
          admin: owner.publicKey,
          globalAccount: extGlobalAccount,
          mMint: mMint.publicKey,
          extMint: wmMint.publicKey,
          mEarnGlobalAccount: earnGlobalAccount,
          token2022: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
    });

  program
    .command('set-evm-addresses')
    .description('Set the EVM addresses to the destination tokens')
    .action(async () => {
      const [owner] = keysFromEnv(['OWNER_KEYPAIR']);

      const tx = new Transaction().add(
        createSetEvmAddresses(PROGRAMS.portal, owner.publicKey, PROGRAMS.mToken, PROGRAMS.wmToken),
      );

      tx.feePayer = owner.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      await sendAndConfirmTransaction(connection, tx, [owner]);

      console.log(`EVM addresses set: ${PROGRAMS.mToken} and ${PROGRAMS.wmToken}`);
    });

  program
    .command('update-lut')
    .description('Initialize or update the LUT for the portal program')
    .action(async () => {
      const [owner, mint] = keysFromEnv(['OWNER_KEYPAIR', 'M_MINT_KEYPAIR']);

      const { ctx, ntt, signer } = NttManager(connection, owner, mint.publicKey);

      const lutTxn = ntt.initializeOrUpdateLUT({ payer: owner.publicKey });
      await signSendWait(ctx, lutTxn, signer);
      console.log('LUT updated');
    });

  program
    .command('register-peers')
    .description('Initialize or update the LUT for the portal program')
    .action(async () => {
      const [owner, mint] = keysFromEnv(['OWNER_KEYPAIR', 'M_MINT_KEYPAIR']);

      const { ctx, ntt, signer, sender } = NttManager(connection, owner, mint.publicKey);

      // register wormhole xcvr
      const registerTxs = ntt.registerWormholeTransceiver({
        payer: sender,
        owner: sender,
      });
      await signSendWait(ctx, registerTxs, signer);

      const chains = (
        process.env.NETWORK === 'mainnet'
          ? ['Ethereum', 'Arbitrum', 'Optimism']
          : ['Sepolia', 'ArbitrumSepolia', 'OptimismSepolia']
      ) as Chain[];

      for (let chain of chains) {
        assertChain(chain);
        console.log(`Registering transceiver and peer for ${chain}`);

        // set wormhole xcvr peer
        const remoteXcvr: ChainAddress = {
          chain,
          address: new UniversalAddress(PROGRAMS.evmTransiever),
        };
        const setXcvrPeerTxs = ntt.setWormholeTransceiverPeer(remoteXcvr, sender);
        await signSendWait(ctx, setXcvrPeerTxs, signer);

        // set manager peer
        const remoteMgr: ChainAddress = {
          chain,
          address: new UniversalAddress(PROGRAMS.evmPeer),
        };
        const setPeerTxs = ntt.setPeer(remoteMgr, 9, RATE_LIMITS_24.inbound, sender);
        await signSendWait(ctx, setPeerTxs, signer);
      }

      console.log('Transceiver and peers registered');
    });

  program
    .command('update-rate-limits')
    .description('Set the rate limit for inbound/outbound transfers')
    .action(async () => {
      const [owner, mint] = keysFromEnv(['OWNER_KEYPAIR', 'M_MINT_KEYPAIR']);
      const { ctx, ntt, signer, sender } = NttManager(connection, owner, mint.publicKey);

      // outbound
      const updateTxns = ntt.setOutboundLimit(RATE_LIMITS_24.outbound, sender);
      const sigs = await signSendWait(ctx, updateTxns, signer);
      console.log('Updated outbound limit:', sigs[0].txid);

      const chains = (
        process.env.NETWORK === 'mainnet'
          ? ['Ethereum', 'Arbitrum', 'Optimism']
          : ['Sepolia', 'ArbitrumSepolia', 'OptimismSepolia']
      ) as Chain[];

      // inbound
      for (let chain of chains) {
        const updateTxns = ntt.setInboundLimit(chain, RATE_LIMITS_24.inbound, sender);
        const sigs = await signSendWait(ctx, updateTxns, signer);
        console.log(`Updated inbound limit for ${chain}: ${sigs[0].txid}`);
      }
    });

  program
    .command('add-registrar-earner')
    .description('Add earner that is in the earner merkle tree')
    .argument('<earner>', 'The earner to add')
    .action(async (earnerAddress: string) => {
      const [owner, mint] = keysFromEnv(['OWNER_KEYPAIR', 'M_MINT_KEYPAIR']);
      const earner = new PublicKey(earnerAddress);

      // assumes ata is being used as the token account
      const earnerATA = getAssociatedTokenAddressSync(mint.publicKey, earner, true, TOKEN_2022_PROGRAM_ID);

      const earn = new Program<Earn>(EARN_IDL, PROGRAMS.earn, anchorProvider(connection, owner));

      // PDAs
      const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.earn);
      const [earnerAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('earner'), earnerATA.toBuffer()],
        PROGRAMS.earn,
      );

      // fetch registrar earners from mainnet
      const evmCaller = new EvmCaller(evmClient);
      const earners = await evmCaller.getEarners();

      console.log(`earners on registrar: ${earners.map((e) => e.toBase58())}`);

      // validate root
      const global = await earn.account.global.fetch(globalAccount);
      const expectedRoot = await evmCaller.getMerkleRoot('earners');

      const root = '0x' + Buffer.from(global.earnerMerkleRoot).toString('hex');
      if (root !== expectedRoot) {
        throw new Error(`Root mismatch: expected ${expectedRoot}, got ${root}`);
      }

      const tree = new MerkleTree(earners);
      const proof = tree.getInclusionProof(earner);

      // register the earner with proof
      const sig = await earn.methods
        .addRegistrarEarner(earner, proof.proof)
        .accounts({
          signer: owner.publicKey,
          userTokenAccount: earnerATA,
          globalAccount,
          earnerAccount,
        })
        .signers([])
        .rpc();

      console.log(`Earner added: ${earner.toBase58()} (${sig})`);
    });

  program
    .command('add-earn-manager')
    .description('Add earn manager to the wM earn program')
    .action(async () => {
      const [owner] = keysFromEnv(['OWNER_KEYPAIR']);
      const extEarn = new Program<ExtEarn>(EXT_EARN_IDL, PROGRAMS.extEarn, anchorProvider(connection, owner));

      const [earnManagerAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('earn_manager'), owner.publicKey.toBuffer()],
        PROGRAMS.extEarn,
      );

      const managerATA = await getOrCreateAssociatedTokenAccount(
        connection,
        owner,
        EXT_MINT,
        earnManagerAccount,
        true,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID,
      );

      const sig = await extEarn.methods
        .addEarnManager(owner.publicKey, new BN(15))
        .accounts({
          admin: owner.publicKey,
          globalAccount: EXT_GLOBAL_ACCOUNT,
          earnManagerAccount,
          feeTokenAccount: managerATA.address,
        })
        .rpc({ skipPreflight: true });

      console.log(`Earn manager added: ${earnManagerAccount.toBase58()} (${sig})`);
    });

  program
    .command('add-earner')
    .description('Add earner to the wM earn program')
    .argument('<earner>', 'The earner to add')
    .action(async (earnerAddress: string) => {
      const [owner] = keysFromEnv(['OWNER_KEYPAIR']);
      const earner = new PublicKey(earnerAddress);

      const evmClient = createPublicClient({ transport: http(process.env.ETH_RPC_URL) });
      const manager = await EarnManager.fromManagerAddress(connection, evmClient, owner.publicKey);

      const ixs = await manager.buildAddEarnerInstruction(earner);
      const sig = await sendAndConfirmTransaction(connection, new Transaction().add(...ixs), [owner]);

      console.log(`Earner added: ${earner.toBase58()} (${sig})`);
    });

  program
    .command('set-earn-auth')
    .description('Set the earn authority on the program')
    .argument('<earn-auth>', 'Earn authority pubkey')
    .action(async (earnAuthAddress: string) => {
      const [owner] = keysFromEnv(['OWNER_KEYPAIR']);
      const earnAuth = new PublicKey(earnAuthAddress);

      const earn = new Program<Earn>(EARN_IDL, PROGRAMS.earn, anchorProvider(connection, owner));
      const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAMS.earn);

      const sig = await earn.methods
        .setEarnAuthority(earnAuth)
        .accounts({
          admin: owner.publicKey,
          globalAccount,
        })
        .signers([])
        .rpc();

      console.log(`Earn authority set (${sig})`);
    });

  await program.parseAsync(process.argv);
}

async function createToken2022Mint(
  connection: Connection,
  payer: Keypair,
  owner: PublicKey,
  mint: Keypair,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  tokenName: string,
  tokenSymbol: string,
  tokenUri: string,
  evmTokenAddress: string,
) {
  const metaData: TokenMetadata = {
    updateAuthority: owner,
    mint: mint.publicKey,
    name: tokenName,
    symbol: tokenSymbol,
    uri: tokenUri,
    additionalMetadata: [['evm', evmTokenAddress]],
  };

  // mint size with extensions
  const metadataExtension = TYPE_SIZE + LENGTH_SIZE;
  const metadataLen = pack(metaData).length;
  const mintLen = getMintLen([
    ExtensionType.TransferHook,
    ExtensionType.MetadataPointer,
    ExtensionType.ConfidentialTransferMint,
    ExtensionType.ScaledUiAmountConfig,
  ]);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataExtension + metadataLen);

  const instructions = [
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(mint.publicKey, owner, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeTransferHookInstruction(
      mint.publicKey,
      owner, // authority
      PublicKey.default, // no transfer hook
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeConfidentialTransferMintInstruction(mint.publicKey, owner, false),
    createInitializeScaledUiAmountConfigInstruction(
      mint.publicKey,
      owner, // authority
      1, // multiplier
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMintInstruction(
      mint.publicKey,
      6,
      payer.publicKey, // will transfer on last instruction
      freezeAuthority, // if null, there is no freeze authority
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: owner,
      mint: mint.publicKey,
      mintAuthority: owner,
      name: metaData.name,
      symbol: metaData.symbol,
      uri: metaData.uri,
    }),
    createUpdateFieldInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: owner,
      field: metaData.additionalMetadata[0][0],
      value: metaData.additionalMetadata[0][1],
    }),
    createSetAuthorityInstruction(
      mint.publicKey,
      payer.publicKey,
      AuthorityType.MintTokens,
      mintAuthority,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    ),
  ];

  const blockhash = await connection.getLatestBlockhash();
  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);
  transaction.sign([payer, mint]);

  await connection.sendTransaction(transaction);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
