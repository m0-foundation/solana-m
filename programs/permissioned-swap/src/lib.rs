#![allow(unexpected_cfgs)]

pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

use instructions::*;

declare_id!("7B9Roa5xoEpK8EZ1wHL9V9T7QvevhSUjUEQT9mxhYBYN");

#[program]
pub mod permissioned_swap {
    use super::*;

    pub fn initialize_global(ctx: Context<InitializeGlobal>) -> Result<()> {
        InitializeGlobal::handler(ctx)
    }

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        seed: u8,
        trade_fee_bps: u16,
        swap_mints: Vec<Pubkey>,
    ) -> Result<()> {
        InitializePool::handler(ctx, seed, trade_fee_bps, swap_mints)
    }
}
