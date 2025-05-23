use anchor_lang::prelude::*;

pub const GLOBAL_SEED: &str = "global";
pub const POOL_CONFIG_SEED: &str = "pool_config";
pub const POOL_AUTH: &str = "pool_auth";
pub const LP_MINT_SEED: &str = "lp_mint";

#[account]
#[derive(InitSpace)]
pub struct Global {
    pub admin: Pubkey,
    pub global_freeze: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PoolConfig {
    pub trade_fee_bps: u16,
    pub seed: u8,
    pub bump: u8,
    pub lp_mint: Pubkey,
    pub swap_mints: [Pubkey; 10],
}
