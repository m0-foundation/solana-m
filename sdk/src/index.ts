import { PublicKey } from '@solana/web3.js';

// Solana program IDs
export const PROGRAM_ID = new PublicKey('MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c');
export const EXT_PROGRAM_ID = new PublicKey('wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko');
export const TOKEN_2022_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const MINT = new PublicKey('mzerokyEX9TNDoK4o2YZQBDmMzjokAeN6M2g2S3pLJo');
export const EXT_MINT = new PublicKey('mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp');
export const MINT_MULTISIG = new PublicKey('ms2SCrTYioPuumF6oBvReXoVRizEW5qYkiVuUEak7Th');
export const GLOBAL_ACCOUNT = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID)[0];
export const EXT_GLOBAL_ACCOUNT = PublicKey.findProgramAddressSync([Buffer.from('global')], EXT_PROGRAM_ID)[0];
export const EARN_ADDRESS_TABLE = new PublicKey('HtKQ9sHyMhun73asZsARkGCc1fDz2dQH7QhGfFJcQo7S');

// Ethereum contract addresses
export const ETH_M_ADDRESS: `0x${string}` = '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b';
export const ETH_MERKLE_TREE_BUILDER: `0x${string}` = '0x050258e4761650ad774b5090a5DA0e204348Eb48';

// Graph IDs
export const MAINNET_GRAPH_ID = 'bgd3AFHw9bcSox1mfU39W9NbYUeSY53fr4kaVzmkPjC';
export const DEVNET_GRAPH_ID = 'Exir1TE2og5jCPjAM5485NTHtgT6oAEHTevYhvpU8UFL';

// Re-export the viem PublicClient type
export { PublicClient, createPublicClient, createTestClient, http } from 'viem';

export { EarnAuthority } from './earn_auth';
export { EarnManager } from './earn_manager';
export { Earner } from './earner';
export { EvmCaller } from './evm_caller';
export { Graph } from './graph';
export { Registrar } from './registrar';
export * from './logger';
export * from './transaction';
