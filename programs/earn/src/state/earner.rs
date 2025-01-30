// earn/state/earner.rs

use anchor_lang::prelude::*;

#[constant]
pub const EARNER_SEED: &[u8] = b"earner";

#[account]
#[derive(InitSpace)]
pub struct Earner {
    pub earn_manager: Pubkey,
    pub last_claim_index: u64
}