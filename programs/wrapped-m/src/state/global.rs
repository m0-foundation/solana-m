// wrapped-m/state/global.rs

use anchor_lang::prelude::*;

#[constant]
pub const GLOBAL_SEED: &[u8] = b"global";

#[account]
#[derive(InitSpace)]
pub struct Global {
    pub admin: Pubkey,
    pub earn_authority: Pubkey,
    pub ext_mint: Pubkey,
    pub m_mint: Pubkey,
    pub m_earn_global_account: Pubkey,
    pub index: u64,
    pub timestamp: u64,
    pub bump: u8,
    pub m_vault_bump: u8,
    pub ext_mint_authority_bump: u8,
}