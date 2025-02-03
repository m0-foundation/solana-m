// earn/constants.rs

use anchor_lang::prelude::*;

pub const MINT_MASTER: Pubkey = pubkey!("7j9tN2dS7CuPfKPFvhh8HWWNgsPgN7jsDdDiPXMrjemb");
pub const PORTAL_SIGNER: Pubkey = pubkey!("A27rCMHqtKYz95PEkeadsUeMctofs3i4R8MRXNh9We9m");
pub const REGISTRAR: Pubkey = pubkey!("BsvrfNL85iCTtQoxWwnLGJECBzpzqJw1zyYyZYLU5kex");

pub const REWARDS_SCALE: u128 = 1_000_000_000_000; // 1e12 = (1e6)^2