// common/constants.rs

use anchor_lang::{pubkey, prelude::*};

// TODO add different constants depending on local, devnet, or mainnet feature flags
pub const ANCHOR_DISCRIMINATOR_SIZE: usize = 8;
pub const DEFAULT_ADMIN: Pubkey = pubkey!("7cCg21cZSrVVoxVjNUAD4qUnrAjhe1cPvz9Cw3JtkgW8"); // add default admin address to be used to initialize the system
pub const MINT: Pubkey = pubkey!("3ncYjg2rR2u3pDSgZYchhqCwY86TwBkyAcU7gnkQNaVy");
pub const REGISTRAR: Pubkey = pubkey!("BsvrfNL85iCTtQoxWwnLGJECBzpzqJw1zyYyZYLU5kex");

pub const ONE: u64 = 1_000_000; // 1e6