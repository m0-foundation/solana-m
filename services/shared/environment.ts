import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Turnkey } from '@turnkey/sdk-server';
import { TurnkeySigner } from '@turnkey/solana';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia, mainnet } from 'viem/chains';
import {
  createPublicClient,
  DEVNET_GRAPH_ID,
  http,
  MAINNET_GRAPH_ID,
  PublicClient,
  Graph,
} from '@m0-foundation/solana-m-sdk';
import { Hex, createWalletClient, WalletClient } from 'viem';

type TurnkeyEnvOption = {
  signer: TurnkeySigner;
  pubkey: string;
};

type SquadsEnvOption = {
  squadsPda: PublicKey;
  squadsVault: PublicKey;
};

export interface EnvOptions {
  isDevnet: boolean;
  connection: Connection;
  evmClient: PublicClient;
  evmWalletClient?: WalletClient;
  graphClient: Graph;
  signerPubkey: PublicKey;
  signer?: Keypair;
  squads?: SquadsEnvOption;
  turnkey?: TurnkeyEnvOption;
}

export function getEnv(): EnvOptions {
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
    EVM_KEY,
  } = process.env;

  let signer: Keypair | undefined;
  if (KEYPAIR) {
    try {
      signer = Keypair.fromSecretKey(Buffer.from(JSON.parse(KEYPAIR!)));
    } catch {
      signer = Keypair.fromSecretKey(Buffer.from(KEYPAIR!, 'base64'));
    }
  }

  const isDevnet = RPC_URL!.includes('devnet');
  const graphID = isDevnet ? DEVNET_GRAPH_ID : MAINNET_GRAPH_ID;

  let evmWalletClient: WalletClient | undefined;
  if (EVM_KEY) {
    evmWalletClient = createWalletClient({
      transport: http(EVM_RPC_URL),
      account: privateKeyToAccount(EVM_KEY as Hex),
      chain: isDevnet ? sepolia : mainnet,
    });
  }

  let turnkey: TurnkeyEnvOption | undefined;
  if (TURNKEY_API_PRIVATE_KEY && TURNKEY_API_PUBLIC_KEY) {
    const tk = new Turnkey({
      apiBaseUrl: 'https://api.turnkey.com',
      apiPrivateKey: TURNKEY_API_PRIVATE_KEY!,
      apiPublicKey: TURNKEY_API_PUBLIC_KEY!,
      defaultOrganizationId: '01b5aa43-216b-4a70-bd03-e40d6759c4f9',
    });

    const tkSigner = new TurnkeySigner({
      organizationId: '01b5aa43-216b-4a70-bd03-e40d6759c4f9',
      client: tk.apiClient(),
    });

    turnkey = {
      pubkey: TURNKEY_PUBKEY!,
      signer: tkSigner,
    };
  }

  if (!evmWalletClient && !signer && !turnkey) {
    throw new Error('As signer or turnkey setup is required');
  }

  let squads: SquadsEnvOption | undefined;
  if (SQUADS_PDA && SQUADS_VAULT) {
    squads = {
      squadsPda: new PublicKey(SQUADS_PDA!),
      squadsVault: new PublicKey(SQUADS_VAULT!),
    };
  }

  return {
    isDevnet,
    signer,
    signerPubkey: signer ? signer.publicKey : turnkey ? new PublicKey(turnkey!.pubkey) : PublicKey.default,
    connection: new Connection(RPC_URL!, 'confirmed'),
    evmClient: createPublicClient({ transport: http(EVM_RPC_URL!) }),
    evmWalletClient,
    graphClient: new Graph(GRAPH_KEY!, graphID),
    turnkey,
    squads,
  };
}
