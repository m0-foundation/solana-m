// no_earn/state/global.rs

use anchor_lang::prelude::*;

#[constant]
pub const EXT_GLOBAL_SEED: &[u8] = b"global";

#[account]
#[derive(InitSpace)]
pub struct ExtGlobal {
    pub admin: Pubkey,          // can update config values
    pub wrap_authority: Pubkey, // can wrap/unwrap M <> Ext
    pub ext_mint: Pubkey,       // m extension mint
    pub m_mint: Pubkey,         // m mint
    pub bump: u8,
    pub m_vault_bump: u8,
    pub ext_mint_authority_bump: u8,
}
