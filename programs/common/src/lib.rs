// common/lib.rs - top-level file

pub mod constants;
pub mod errors;
pub mod utils;

use anchor_lang::prelude::*;

// Dummy program ID for the common crate
declare_id!("11111111111111111111111111111111");

#[program]
pub mod common {}