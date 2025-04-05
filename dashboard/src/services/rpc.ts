import { ComputeBudgetProgram, Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  Mint,
  TOKEN_2022_PROGRAM_ID,
  unpackMint,
} from '@solana/spl-token';
import { EXT_EARN_PROGRAM_ID, M_MINT, wM_MINT } from './consts';
import { type Provider } from '@reown/appkit-adapter-solana/react';
import Decimal from 'decimal.js';
import { getU64Encoder } from '@solana/codecs';

export const MINT_ADDRESSES: Record<string, PublicKey> = {
  M: M_MINT,
  wM: wM_MINT,
};

export const getMintsRPC = async (rpcURL: string): Promise<Record<string, Mint>> => {
  const data: Record<string, Mint> = {};

  try {
    const connection = new Connection(rpcURL);
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

export const wrap = async (walletProvider: Provider, rpcURL: string, amount: Decimal) => {
  const connection = new Connection(rpcURL);
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

  // check if wM token account exists
  try {
    await getAccount(connection, userwMTokenAccount, 'processed', TOKEN_2022_PROGRAM_ID);
  } catch {
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

  const mVault = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], EXT_EARN_PROGRAM_ID)[0];
  const vaultTokenAccount = getAssociatedTokenAddressSync(M_MINT, mVault, true, TOKEN_2022_PROGRAM_ID);

  const ix = new TransactionInstruction({
    keys: [
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
      {
        pubkey: PublicKey.findProgramAddressSync([Buffer.from('mint_authority')], EXT_EARN_PROGRAM_ID)[0],
        isSigner: false,
        isWritable: false,
      },
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
    ],
    data: Buffer.concat([
      Buffer.from('b2280abde481ba8c', 'hex'),
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
