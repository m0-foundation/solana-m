// earn/state/mod.rs

pub mod earn_manager;
pub mod global;
pub mod earner;

pub use earn_manager::*;
pub use global::*;
pub use earner::*;

use anchor_lang::prelude::*;

#[constant]
pub const TOKEN_AUTHORITY_SEED: &[u8] = b"token_authority";