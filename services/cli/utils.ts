import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { SolanaNtt } from '@wormhole-foundation/sdk-solana-ntt';
import { SolanaPlatform, SolanaSendSigner } from '@wormhole-foundation/sdk-solana';
import { Wormhole } from '@wormhole-foundation/sdk';

const PORTAL = new PublicKey('mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY');

export function keysFromEnv(keys: string[]) {
  return keys.map((key) => Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env[key] ?? '[]'))));
}

export function NttManager(connection: Connection, owner: Keypair, mint: PublicKey) {
  const signer = new SolanaSendSigner(connection, 'Solana', owner, false, {
    min: 300_000,
  });
  const sender = Wormhole.parseAddress('Solana', signer.address());

  const wormholeNetwork = process.env.NETWORK === 'devnet' ? 'Testnet' : 'Mainnet';
  const wh = new Wormhole(wormholeNetwork, [SolanaPlatform]);
  const ctx = wh.getChain('Solana');

  const ntt = new SolanaNtt(
    wormholeNetwork,
    'Solana',
    connection,
    {
      ...ctx.config.contracts,
      ntt: {
        token: mint.toBase58(),
        manager: PORTAL.toBase58(),
        transceiver: {
          wormhole: PORTAL.toBase58(),
        },
        quoter: 'Nqd6XqA8LbsCuG8MLWWuP865NV6jR1MbXeKxD4HLKDJ',
      },
    },
    '3.0.0',
  );

  return { ctx, ntt, signer, sender };
}
