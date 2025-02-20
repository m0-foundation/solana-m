// earn/constants.rs

use anchor_lang::prelude::*;
use solana_program::pubkey;

pub const ANCHOR_DISCRIMINATOR_SIZE: usize = 8;

// TODO add different constants depending on local, devnet, or mainnet feature flags
pub const ADMIN: Pubkey = pubkey!("8cR6wkZ4umQQnYcxBwS1wfvPwPXHkuW3wf3toxBEaiAP");
pub const MINT: Pubkey = pubkey!("J4a2cb2G6QbSsAxNiaEQKrshnt6ijnrCnjzDcDdcAbbK");
pub const PORTAL_SIGNER: Pubkey = pubkey!("A27rCMHqtKYz95PEkeadsUeMctofs3i4R8MRXNh9We9m");

pub const REWARDS_SCALE: u128 = 1_000_000_000_000; // 1e12 = (1e6)^2
pub const ONE: u64 = 1_000_000; // 1e6
pub const ONE_HUNDRED_PERCENT: u64 = 100_00; // 1e4
