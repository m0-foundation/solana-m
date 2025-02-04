// common/constants.rs

use anchor_lang::{pubkey, prelude::*};

// TODO add different constants depending on local, devnet, or mainnet feature flags
pub const ANCHOR_DISCRIMINATOR_SIZE: usize = 8;

pub const ADMIN: Pubkey = pubkey!("8cR6wkZ4umQQnYcxBwS1wfvPwPXHkuW3wf3toxBEaiAP"); 
pub const MINT: Pubkey = pubkey!("J4a2cb2G6QbSsAxNiaEQKrshnt6ijnrCnjzDcDdcAbbK");
pub const ZERO_ADDRESS: Pubkey = pubkey!("11111111111111111111111111111111");

pub const ONE: u64 = 1_000_000; // 1e6