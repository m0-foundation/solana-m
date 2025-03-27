// earn/state/earner.rs

use anchor_lang::prelude::*;

#[constant]
pub const EARNER_SEED: &[u8] = b"earner";

#[account]
#[derive(InitSpace)]
pub struct Earner {
    pub user: Pubkey,
    pub last_claim_index: u64,
    pub last_claim_timestamp: u64,
    pub bump: u8,
    pub user_token_account: Pubkey,
    pub earn_manager: Option<Pubkey>, // if None, then the user is a registrar approved earner and does not have an earn manager
    pub recipient_token_account: Option<Pubkey>, // the token account yield is distributed to (cannot be set if earn_manager is set)
}
