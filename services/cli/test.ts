import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { signSendWait, UniversalAddress } from '@wormhole-foundation/sdk';
import { Command } from 'commander';
import * as multisig from '@sqds/multisig';
import { anchorProvider, keysFromEnv, NttManager } from './utils';
import { EXT_GLOBAL_ACCOUNT, EXT_PROGRAM_ID } from '../../sdk/src';
import { getOrCreateAssociatedTokenAccount, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import { Program } from '@coral-xyz/anchor';
import { ExtEarn } from '../../target/types/ext_earn';
const EXT_EARN_IDL = require('../../target/idl/ext_earn.json');

async function main() {
  const program = new Command();

  program
    .command('wrap-m')
    .description('Wrap M to wM')
    .argument('[number]', 'amount', '100000') // 0.1 M
    .action(async (amount) => {
      const connection = new Connection(process.env.RPC_URL ?? '');
      const [sender, m, wM] = keysFromEnv(['OWNER_KEYPAIR', 'M_MINT_KEYPAIR', 'WM_MINT_KEYPAIR']);
      const program = new Program<ExtEarn>(EXT_EARN_IDL, EXT_PROGRAM_ID, anchorProvider(connection, sender));

      const mVault = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], EXT_PROGRAM_ID)[0];
      const extMintAuthority = PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], EXT_PROGRAM_ID)[0];

      const atas: PublicKey[] = [];
      for (const [mint, owner] of [
        [m.publicKey, sender.publicKey],
        [wM.publicKey, sender.publicKey],
        [m.publicKey, mVault],
      ]) {
        const { address } = await getOrCreateAssociatedTokenAccount(
          connection,
          sender,
          mint,
          owner,
          true,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID,
        );
        atas.push(address);
      }

      const [userMTokenAccount, userExtTokenAccount, vaultMTokenAccount] = atas;
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const sig = await program.methods
        .wrap(new BN(amount))
        .accounts({
          signer: sender.publicKey,
          mMint: m.publicKey,
          extMint: wM.publicKey,
          globalAccount: EXT_GLOBAL_ACCOUNT,
          mVault,
          extMintAuthority,
          userMTokenAccount,
          vaultMTokenAccount,
          userExtTokenAccount,
          token2022: TOKEN_2022_PROGRAM_ID,
        })
        .signers([sender])
        .rpc({ commitment: 'processed' });

      console.log(`Wrapped ${amount} M: ${sig}`);
    });

  program
    .command('send-testnet')
    .description('Bridge 1 M from solana devnet to ethereum sepolia')
    .argument('[string]', 'recipient evm address', '0x12b1A4226ba7D9Ad492779c924b0fC00BDCb6217')
    .argument('[number]', 'amount', '100000')
    .action(async (receiver, amount) => {
      const connection = new Connection(process.env.RPC_URL ?? '');
      const [owner, mint] = keysFromEnv(['OWNER_KEYPAIR', 'M_MINT_KEYPAIR']);
      const { ctx, ntt, sender, signer } = NttManager(connection, owner, mint.publicKey);

      const outboxItem = Keypair.generate();
      const xferTxs = ntt.transfer(
        sender,
        BigInt(amount),
        {
          address: new UniversalAddress(receiver, 'hex'),
          chain: 'Sepolia',
        },
        { queue: false, automatic: true, gasDropoff: 0n },
        outboxItem,
      );

      const txnIds = await signSendWait(ctx, xferTxs, signer);
      console.log(`Transaction IDs: ${txnIds.map((id) => id.txid)}`);
    });

  program
    .command('create-squads-multisig')
    .description('create a squads multisig')
    .action(async () => {
      const connection = new Connection(process.env.RPC_URL ?? '');
      const [owner, squadsProposer] = keysFromEnv(['OWNER_KEYPAIR', 'SQUADS_PROPOSER']);
      const createKey = Keypair.generate();

      const programConfigPda = multisig.getProgramConfigPda({})[0];
      const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda);
      const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });

      const signature = await multisig.rpc.multisigCreateV2({
        connection,
        createKey,
        creator: owner,
        multisigPda,
        configAuthority: null,
        timeLock: 0,
        members: [
          {
            key: owner.publicKey,
            permissions: multisig.types.Permissions.all(),
          },
          {
            key: squadsProposer.publicKey,
            permissions: multisig.types.Permissions.fromPermissions([multisig.types.Permission.Initiate]),
          },
        ],
        threshold: 1,
        rentCollector: null,
        treasury: programConfig.treasury,
        sendOptions: { skipPreflight: true },
      });

      await connection.confirmTransaction(signature);
      console.log(`Multisig created: ${createKey.publicKey} (${signature})`);
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
