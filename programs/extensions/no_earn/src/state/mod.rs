// no_earn/state/mod.rs

pub mod global;

pub use global::*;

use anchor_lang::prelude::*;

#[constant]
pub const M_VAULT_SEED: &[u8] = b"m_vault";

#[constant]
pub const MINT_AUTHORITY_SEED: &[u8] = b"mint_authority";
