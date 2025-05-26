use anchor_lang::prelude::*;

pub const GLOBAL_SEED: &str = "global";
pub const POOL_CONFIG_SEED: &str = "pool_config";
pub const POOL_AUTH: &str = "pool_auth";
pub const POOL_ACTOR: &str = "pool_actor";

#[account]
#[derive(InitSpace)]
pub struct Global {
    pub admin: Pubkey,
    pub global_freeze: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub swap_mint_a: Pubkey,
    pub swap_mint_b: Pubkey,
    pub swap_mode: SwapMode,
    pub trade_fee_bps: u16,
    pub bump: u8,
    pub oracle: Option<OracleConfig>,
}

#[account]
#[derive(InitSpace)]
pub struct OracleConfig {
    pub oracle_a: Pubkey,
    pub oracle_b: Pubkey,
}

#[derive(Clone, PartialEq, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub enum SwapMode {
    Pegged,
    Oracle,
}

#[account]
#[derive(InitSpace)]
pub struct ApprovedPoolActor {
    pub owner: Pubkey,
    pub deposits_a: u64,
    pub deposits_b: u64,
    pub bump: u8,
}
