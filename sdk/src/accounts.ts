import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export interface EarnManagerData {
  isActive: boolean;
  feeBps: BN;
  feeTokenAccount: PublicKey;
  bump: number;
  earnManager: PublicKey;
}

export interface GlobalAccountData {
  admin: PublicKey;
  earnAuthority: PublicKey;
  mint: PublicKey;
  index: BN;
  timestamp: BN;
  maxSupply?: BN;
  maxYield?: BN;
  distributed?: BN;
  claimComplete?: boolean;
}

export interface EarnerData {
  user: PublicKey;
  lastClaimIndex: BN;
  lastClaimTimestamp: BN;
  bump: number;
  userTokenAccount: PublicKey;
  earnManager?: PublicKey | null;
  recipientTokenAccount?: PublicKey | null;
}
