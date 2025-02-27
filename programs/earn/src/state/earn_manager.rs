// earn/state/earn_manager.rs

use anchor_lang::prelude::*;

#[constant]
pub const EARN_MANAGER_SEED: &[u8] = b"earn-manager";

#[account]
#[derive(InitSpace)]
pub struct EarnManager {
    pub is_active: bool,
    pub fee_bps: u64,
    pub fee_token_account: Pubkey,
    pub bump: u8,
}
