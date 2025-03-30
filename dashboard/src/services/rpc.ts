import { Connection, PublicKey } from '@solana/web3.js';
import { Mint, TOKEN_2022_PROGRAM_ID, unpackMint } from '@solana/spl-token';

const MINT_ADDRESSES = [
  new PublicKey('mzeroZRGCah3j5xEWp2Nih3GDejSBbH1rbHoxDg8By6'), // M
];

export const getMints = async (rpcURL: string): Promise<Mint[]> => {
  try {
    const connection = new Connection(rpcURL);
    const accountInfos = await connection.getMultipleAccountsInfo(MINT_ADDRESSES);
    return accountInfos.map((accountInfo, index) =>
      unpackMint(MINT_ADDRESSES[index], accountInfo, TOKEN_2022_PROGRAM_ID),
    );
  } catch (error) {
    console.error('Failed to get mints:', error);
    return [];
  }
};
