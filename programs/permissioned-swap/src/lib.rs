#![allow(unexpected_cfgs)]

pub mod errors;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

use crate::state::SwapMode;
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
        swap_mode: SwapMode,
        trade_fee_bps: u16,
    ) -> Result<()> {
        InitializePool::handler(ctx, swap_mode, trade_fee_bps)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        Deposit::handler(ctx, amount)
    }
}
