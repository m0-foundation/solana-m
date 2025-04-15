import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  Mint,
  TOKEN_2022_PROGRAM_ID,
  unpackMint,
} from '@solana/spl-token';
import { EXT_EARN_PROGRAM_ID, M_MINT, PORTAL, wM_MINT } from './consts';
import { type Provider } from '@reown/appkit-adapter-solana/react';
import Decimal from 'decimal.js';
import { getU64Encoder } from '@solana/codecs';
import { signSendWait, UniversalAddress, Wormhole } from '@wormhole-foundation/sdk';
import { SolanaNtt } from '@wormhole-foundation/sdk-solana-ntt';
import { EvmNtt } from '@wormhole-foundation/sdk-evm-ntt';
import { SolanaPlatform } from '@wormhole-foundation/sdk-solana';
import { EvmPlatform } from '@wormhole-foundation/sdk-evm';
import { SendTransactionMutate } from 'wagmi/query';
import { Config } from 'wagmi';
import { JsonRpcProvider } from 'ethers';

export const MINT_ADDRESSES: Record<string, PublicKey> = {
  M: M_MINT,
  wM: wM_MINT,
};

export const NETWORK: 'devnet' | 'mainnet' = import.meta.env.VITE_NETWORK;
const connection = new Connection(import.meta.env.VITE_RPC_URL);

export const getMintsRPC = async (): Promise<Record<string, Mint>> => {
  const data: Record<string, Mint> = {};

  try {
    const accountInfos = await connection.getMultipleAccountsInfo(Object.values(MINT_ADDRESSES));

    for (const [index, accountInfo] of accountInfos.entries()) {
      const mint = unpackMint(Object.values(MINT_ADDRESSES)[index], accountInfo, TOKEN_2022_PROGRAM_ID);
      data[Object.keys(MINT_ADDRESSES)[index]] = mint;
    }
  } catch (error) {
    console.error('Failed to get mints:', error);
    return {};
  }

  return data;
};

export const wrapOrUnwrap = async (action: 'wrap' | 'unwrap', walletProvider: Provider, amount: Decimal) => {
  const ixs: TransactionInstruction[] = [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 250_000 })];

  if (!walletProvider.publicKey) {
    throw new Error('Wallet not connected');
  }

  const userTokenAccount = getAssociatedTokenAddressSync(
    M_MINT,
    walletProvider.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const userwMTokenAccount = getAssociatedTokenAddressSync(
    wM_MINT,
    walletProvider.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  // check if token account exists
  for (const tokenAccount of [userTokenAccount, userwMTokenAccount]) {
    try {
      await getAccount(connection, tokenAccount, 'processed', TOKEN_2022_PROGRAM_ID);
    } catch {
      // add create ix
      ixs.push(
        createAssociatedTokenAccountInstruction(
          walletProvider.publicKey,
          userwMTokenAccount,
          walletProvider.publicKey,
          wM_MINT,
          TOKEN_2022_PROGRAM_ID,
        ),
      );
    }
  }

  const mVault = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], EXT_EARN_PROGRAM_ID)[0];
  const vaultTokenAccount = getAssociatedTokenAddressSync(M_MINT, mVault, true, TOKEN_2022_PROGRAM_ID);

  const keys = [
    {
      pubkey: walletProvider.publicKey,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: M_MINT,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: wM_MINT,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: PublicKey.findProgramAddressSync([Buffer.from('global')], EXT_EARN_PROGRAM_ID)[0],
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: mVault,
      isSigner: false,
      isWritable: false,
    },
  ];

  if (action === 'wrap') {
    keys.push({
      pubkey: PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], EXT_EARN_PROGRAM_ID)[0],
      isSigner: false,
      isWritable: false,
    });
  }

  keys.push(
    {
      pubkey: userTokenAccount,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: vaultTokenAccount,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: userwMTokenAccount,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: TOKEN_2022_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
  );

  const ix = new TransactionInstruction({
    keys,
    data: Buffer.concat([
      Buffer.from(action === 'wrap' ? 'b2280abde481ba8c' : '7eafc60ed445322c', 'hex'),
      Buffer.from(getU64Encoder().encode(BigInt(amount.toString()))),
    ]),
    programId: EXT_EARN_PROGRAM_ID,
  });

  const tx = new Transaction().add(...ixs, ix);
  tx.feePayer = walletProvider.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;

  const sig = await walletProvider.signAndSendTransaction(tx);
  await connection.confirmTransaction(sig, 'confirmed');

  return sig;
};

export const bidgeFromSolana = async (
  walletProvider: Provider,
  amount: Decimal,
  recipient: string,
  toChain: string,
) => {
  const ntt = NttManager(connection, M_MINT);

  if (!walletProvider.publicKey) {
    throw new Error('Wallet not connected');
  }

  const sender = Wormhole.parseAddress('Solana', walletProvider.publicKey.toBase58());

  const outboxItem = Keypair.generate();
  const xferTxs = ntt.transfer(
    sender,
    BigInt(amount.toString()),
    {
      address: new UniversalAddress(recipient, 'hex'),
      chain: toChain as any,
    },
    { queue: false, automatic: true, gasDropoff: 0n },
    outboxItem,
  );

  let sig = '';
  for await (const tx of xferTxs) {
    const t = tx.transaction.transaction as VersionedTransaction;

    // decompile to add compute budget ix
    const ixs = TransactionMessage.decompile(t.message, {
      addressLookupTableAccounts: [ntt.addressLookupTable!],
    }).instructions;
    ixs.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 500_000,
      }),
    );

    let newTx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: walletProvider.publicKey,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: [...ixs],
      }).compileToV0Message([await ntt.getAddressLookupTable()]),
    );

    // sign
    newTx = await walletProvider.signTransaction(newTx);
    newTx.sign([outboxItem]);

    sig = await connection.sendTransaction(newTx);
    const { lastValidBlockHeight, blockhash } = await connection.getLatestBlockhash();

    await connection.confirmTransaction(
      {
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight,
        signature: sig,
      },
      'confirmed',
    );
  }

  return sig;
};

export const bidgeFromEvm = async (
  sendTransaction: SendTransactionMutate<Config>,
  address: string | undefined,
  amount: Decimal,
  recipient: string,
  fromChain: string,
) => {
  if (!address) {
    throw new Error('Wallet not connected');
  }

  const ntt = new EvmNtt('Testnet', 'Sepolia', new JsonRpcProvider(import.meta.env.VITE_EVM_RPC_URL), {});
  const sender = Wormhole.parseAddress(fromChain as any, address);

  const xferTxs = ntt.transfer(
    sender.address,
    BigInt(amount.toString()),
    {
      address: new UniversalAddress(recipient, 'base58'),
      chain: 'Solana',
    },
    {
      queue: false,
      automatic: true,
      gasDropoff: 0n,
    },
  );

  let sig: string = '';
  for await (const tx of xferTxs) {
    const { to, data, value } = tx.transaction;

    if (!to || !data || !value) {
      throw new Error('Missing transaction data');
    }

    console.log('params', { to: to, value, data });

    sig = await new Promise((resolve, reject) => {
      sendTransaction(
        {
          to: to as `0x${string}`,
          value: BigInt(value.toString()),
          data: data as `0x${string}`,
        },
        {
          onSuccess: (data) => {
            resolve(data);
          },
          onError: (error) => {
            reject(error);
          },
        },
      );
    });
  }

  return sig;
};

export function NttManager(connection: Connection, mint: PublicKey) {
  const wormholeNetwork = NETWORK === 'devnet' ? 'Testnet' : 'Mainnet';
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

  return ntt;
}
