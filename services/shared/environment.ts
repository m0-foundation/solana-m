import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Turnkey } from '@turnkey/sdk-server';
import { TurnkeySigner } from '@turnkey/solana';
import {
  createPublicClient,
  DEVNET_GRAPH_ID,
  http,
  MAINNET_GRAPH_ID,
  PublicClient,
  Graph,
} from '@m0-foundation/solana-m-sdk';

type TurnkeyEnvOption = {
  turnkey: Turnkey;
  signer: TurnkeySigner;
  pubkey: PublicKey;
};

type SquadsEnvOption = {
  squadsPda: PublicKey;
  squadsVault: PublicKey;
};

export interface EnvOptions {
  isDevnet: boolean;
  signer: Keypair;
  connection: Connection;
  evmClient: PublicClient;
  graphClient: Graph;
  squads?: SquadsEnvOption;
  turnkey?: TurnkeyEnvOption;
}

export function getEnv() {
  const {
    KEYPAIR,
    RPC_URL,
    EVM_RPC_URL,
    GRAPH_KEY,
    TURNKEY_API_PRIVATE_KEY,
    TURNKEY_API_PUBLIC_KEY,
    TURNKEY_PUBKEY,
    SQUADS_PDA,
    SQUADS_VAULT,
  } = process.env;

  let signer: Keypair;
  try {
    signer = Keypair.fromSecretKey(Buffer.from(JSON.parse(KEYPAIR!)));
  } catch {
    signer = Keypair.fromSecretKey(Buffer.from(KEYPAIR!, 'base64'));
  }

  const isDevnet = RPC_URL!.includes('devnet');
  const graphID = isDevnet ? DEVNET_GRAPH_ID : MAINNET_GRAPH_ID;

  let turnkeyOpt: TurnkeyEnvOption | undefined;
  if (TURNKEY_API_PRIVATE_KEY && TURNKEY_API_PUBLIC_KEY) {
    const turnkey = new Turnkey({
      apiBaseUrl: 'https://api.turnkey.com',
      apiPrivateKey: TURNKEY_API_PRIVATE_KEY!,
      apiPublicKey: TURNKEY_API_PUBLIC_KEY!,
      defaultOrganizationId: '01b5aa43-216b-4a70-bd03-e40d6759c4f9',
    });

    const tkSigner = new TurnkeySigner({
      organizationId: '01b5aa43-216b-4a70-bd03-e40d6759c4f9',
      client: turnkey.apiClient(),
    });

    turnkeyOpt = {
      pubkey: new PublicKey(TURNKEY_PUBKEY!),
      signer: tkSigner,
      turnkey,
    };
  }

  let squadsOpt: SquadsEnvOption | undefined;
  if (SQUADS_PDA && SQUADS_VAULT) {
    squadsOpt = {
      squadsPda: new PublicKey(SQUADS_PDA!),
      squadsVault: new PublicKey(SQUADS_VAULT!),
    };
  }

  return {
    isDevnet,
    signer,
    connection: new Connection(RPC_URL!, 'confirmed'),
    evmClient: createPublicClient({ transport: http(EVM_RPC_URL!) }),
    graphClient: new Graph(GRAPH_KEY!, graphID),
    turnkeyOpt,
    squadsOpt,
  };
}
