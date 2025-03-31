import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export interface EarnManagerData {
  isActive: boolean;
  feeBps: BN;
  feeTokenAccount: PublicKey;
  bump: number;
  owner: PublicKey;
}

export interface GlobalAccountData {
  admin: PublicKey;
  earnAuthority: PublicKey;
  mint: PublicKey;
  index: BN;
  timestamp: BN;
  claimCooldown: BN;
  maxSupply: BN;
  maxYield: BN;
  distributed: BN;
  claimComplete: boolean;
  earnerMerkleRoot: number[];
  earnManagerMerkleRoot: number[];
  bump: number;
}

export interface EarnerData {
  user: PublicKey;
  lastClaimIndex: BN;
  lastClaimTimestamp: BN;
  isEarning: boolean;
  bump: number;
  userTokenAccount: PublicKey;
  earnManager: PublicKey | null;
  recipientTokenAccount: PublicKey | null;
}
