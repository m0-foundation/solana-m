import { PublicKey } from '@solana/web3.js';

export const EARN_PROGRAM_ID = new PublicKey('MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c');
export const EXT_EARN_PROGRAM_ID = new PublicKey('wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko');
export const wM_MINT = new PublicKey('mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp');
export const PORTAL = new PublicKey('mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY');

export const M_MINT =
  import.meta.env.VITE_NETWORK === 'devnet'
    ? new PublicKey('mzeroZRGCah3j5xEWp2Nih3GDejSBbH1rbHoxDg8By6')
    : new PublicKey('mzerokyEX9TNDoK4o2YZQBDmMzjokAeN6M2g2S3pLJo');
