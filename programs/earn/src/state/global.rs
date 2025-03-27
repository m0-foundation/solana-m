// earn/state/global.rs

use anchor_lang::prelude::*;

#[constant]
pub const GLOBAL_SEED: &[u8] = b"global";

#[account]
#[derive(InitSpace)]
pub struct Global {
    pub admin: Pubkey,            // can update config values
    pub earn_authority: Pubkey,   // address that can distribute yield
    pub portal_authority: Pubkey, // portal authority that propogates indexes and roots
    pub mint: Pubkey,
    pub index: u64,          // most recent index that yield is being distributed for
    pub timestamp: u64,      // timestamp of the most recent index update
    pub claim_cooldown: u64, // cooldown period between claim cycles
    pub max_supply: u64, // max supply of the token over the period that yield is being distributed for
    pub max_yield: u64,  // max yield that can be distributed in this claim cycle
    pub distributed: u64, // total yield distributed in this claim cycle
    pub claim_complete: bool,
    pub earner_merkle_root: [u8; 32],
    pub earn_manager_merkle_root: [u8; 32],
    pub bump: u8,
}
