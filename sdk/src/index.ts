import { PublicKey } from '@solana/web3.js';

// Solana program IDs
export const PROGRAM_ID = new PublicKey('MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c');
export const EXT_PROGRAM_ID = new PublicKey('wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko');
export const TOKEN_2022_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const MINT = new PublicKey('mzeroZRGCah3j5xEWp2Nih3GDejSBbH1rbHoxDg8By6');
export const EXT_MINT = new PublicKey('mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp');
export const MINT_MULTISIG = new PublicKey('ms2SCrTYioPuumF6oBvReXoVRizEW5qYkiVuUEak7Th');
export const GLOBAL_ACCOUNT = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID)[0];
export const EXT_GLOBAL_ACCOUNT = PublicKey.findProgramAddressSync([Buffer.from('global')], EXT_PROGRAM_ID)[0];

// Ethereum contract addresses
export const ETH_M_ADDRESS: `0x${string}` = '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b';
export const ETH_MERKLE_TREE_BUILDER: `0x${string}` = '0x050258e4761650ad774b5090a5DA0e204348Eb48';

// Re-export the viem PublicClient type
export { PublicClient, createPublicClient, createTestClient, http } from 'viem';
