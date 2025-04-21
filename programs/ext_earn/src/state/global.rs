// ext_earn/state/global.rs

use anchor_lang::prelude::*;

#[constant]
pub const EXT_GLOBAL_SEED: &[u8] = b"global";

#[account]
#[derive(InitSpace)]
pub struct ExtGlobal {
    pub admin: Pubkey,                 // can update config values
    pub earn_authority: Pubkey,        // address that can distribute yield
    pub ext_mint: Pubkey,              // m extension mint
    pub m_mint: Pubkey,                // m mint
    pub m_earn_global_account: Pubkey, // m earn global account
    pub index: u64,                    // most recent index that yield is being distributed for
    pub timestamp: u64,                // timestamp of the most recent index update
    pub bump: u8,
    pub m_vault_bump: u8,
    pub ext_mint_authority_bump: u8,
}
