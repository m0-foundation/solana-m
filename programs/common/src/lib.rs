// common/lib.rs - top-level file

pub mod constants;
pub mod errors;
pub mod utils;

use anchor_lang::prelude::*;

declare_id!("37Bvn81nj7sgETZQxy2vpKjTSR6tGtuGy4gNJhC19F14");

#[program]
pub mod common {}