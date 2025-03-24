import { Connection, Keypair } from '@solana/web3.js';
import { signSendWait, UniversalAddress } from '@wormhole-foundation/sdk';
import { Command } from 'commander';
import { keysFromEnv, NttManager } from './utils';

async function main() {
  const program = new Command();

  program
    .command('send-testnet')
    .description('Bridge 1 M from solana devnet to ethereum sepolia')
    .argument('[string]', 'recipient evm address', '0x12b1A4226ba7D9Ad492779c924b0fC00BDCb6217')
    .argument('[number]', 'amount', '100000')
    .action(async (receiver, amount) => {
      const connection = new Connection(process.env.RPC_URL ?? '');
      const [owner, mint] = keysFromEnv(['OWNER_KEYPAIR', 'MINT_KEYPAIR']);
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

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
