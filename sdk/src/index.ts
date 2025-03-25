import { PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c');
export const TOKEN_2022_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const MINT = new PublicKey('mzeroZRGCah3j5xEWp2Nih3GDejSBbH1rbHoxDg8By6');
export const MINT_MULTISIG = new PublicKey('ms2SCrTYioPuumF6oBvReXoVRizEW5qYkiVuUEak7Th');
export const GLOBAL_ACCOUNT = PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID)[0];
