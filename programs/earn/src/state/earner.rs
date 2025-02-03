// earn/state/earner.rs

use anchor_lang::prelude::*;

#[constant]
pub const EARNER_SEED: &[u8] = b"earner";

#[account]
#[derive(InitSpace)]
pub struct Earner {
    pub earn_manager: Pubkey,
    pub last_claim_index: u64,
    pub is_earning: bool, // earning flag to prevent claims after an earner is removed but the account has not been deleted
}