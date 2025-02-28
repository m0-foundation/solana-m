// earn/state/earner.rs

use anchor_lang::prelude::*;

#[constant]
pub const EARNER_SEED: &[u8] = b"earner";

#[account]
#[derive(InitSpace)]
pub struct Earner {
    pub earn_manager: Option<Pubkey>, // if None, then the user is a registrar approved earner and does not have an earn manager
    pub last_claim_index: u64,
    pub last_claim_timestamp: u64,
    pub is_earning: bool, // earning flag to prevent claims after an earner is removed but the account has not been deleted
    pub bump: u8,
    pub user: Pubkey,
    pub user_token_account: Pubkey,
}
