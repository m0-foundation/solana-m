// earn/state/global.rs

use anchor_lang::prelude::*;

#[constant]
pub const GLOBAL_SEED: &[u8] = b"global";

#[account]
#[derive(InitSpace)]
pub struct Global {
    earn_authority: Pubkey,
    index: u64,
    timestamp: u64,
    claim_cooldown: u64,
    rewards_per_token: u64,
    max_yield: u64,
    distributed: u64,
    claim_complete: bool,
}