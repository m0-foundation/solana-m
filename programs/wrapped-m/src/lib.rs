// earn/lib.rs - top-level program file

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;
use instructions::*;

declare_id!("ATPNKbFx7D5bQaKV4YSsoQePsUpkrihHBHLzPKTPeuzL");

#[program]
pub mod wrapped_m {
    use super::*;

    // Admin instructions

    pub fn initialize(
        ctx: Context<Initialize>,
        earn_authority: Pubkey,
    ) -> Result<()> {
        instructions::admin::initialize::handler(ctx, earn_authority)
    }

    pub fn add_earner(ctx: Context<AddEarner>, user: Pubkey) -> Result<()> {
        instructions::admin::add_earner::handler(ctx, user)
    }

    pub fn remove_earner(ctx: Context<RemoveEarner>) -> Result<()> {
        instructions::admin::remove_earner::handler(ctx)
    }

    pub fn set_earn_authority(ctx: Context<SetEarnAuthority>, new_earn_authority: Pubkey) -> Result<()> {
        instructions::admin::set_earn_authority::handler(ctx, new_earn_authority)
    }

    // Earn authority instructions

    pub fn claim_for(ctx: Context<ClaimFor>, snapshot_balance: u64) -> Result<()> {
        instructions::earn_authority::claim_for::handler(ctx, snapshot_balance)
    }

    pub fn sync(ctx: Context<Sync>) -> Result<()> {
        instructions::earn_authority::sync::handler(ctx)
    }

    // Earner instructions

    pub fn set_yield_recipient(ctx: Context<SetYieldRecipient>) -> Result<()> {
        instructions::earner::set_yield_recipient::handler(ctx)
    }

    // Open instructions
   
    pub fn wrap(ctx: Context<Wrap>, amount: u64) -> Result<()> {
        instructions::open::wrap::handler(ctx, amount)
    }

    pub fn unwrap(ctx: Context<Unwrap>, amount: u64) -> Result<()> {
        instructions::open::unwrap::handler(ctx, amount)
    }
}
