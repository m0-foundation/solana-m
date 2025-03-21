// wrapped-m/state/mod.rs

use anchor_lang::prelude::*;

#[constant]
pub const M_VAULT_SEED: &[u8] = b"m_vault";

#[constant]
pub const MINT_AUTHORITY_SEED: &[u8] = b"mint_authority";

pub mod global;
pub mod earner;

pub use global::*;
pub use earner::*;