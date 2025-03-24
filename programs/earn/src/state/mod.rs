// earn/state/mod.rs

pub mod earner;
pub mod global;

pub use earner::*;
pub use global::*;

use anchor_lang::prelude::*;

#[constant]
pub const TOKEN_AUTHORITY_SEED: &[u8] = b"token_authority";
