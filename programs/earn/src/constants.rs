// earn/constants.rs

use anchor_lang::prelude::*;
use solana_program::pubkey;

pub const ANCHOR_DISCRIMINATOR_SIZE: usize = 8;

// TODO add different constants depending on local, devnet, or mainnet feature flags
pub const MINT: Pubkey = pubkey!("J4a2cb2G6QbSsAxNiaEQKrshnt6ijnrCnjzDcDdcAbbK");
pub const PORTAL_PROGRAM: Pubkey = pubkey!("mZEroYvA3c4od5RhrCHxyVcs2zKsp8DTWWCgScFzXPr");

pub const ONE_HUNDRED_PERCENT: u64 = 100_00; // 1e4
