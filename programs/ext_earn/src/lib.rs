// ext_earn/lib.rs - top-level program file

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

use instructions::*;

declare_id!("ATPNKbFx7D5bQaKV4YSsoQePsUpkrihHBHLzPKTPeuzL");

#[program]
pub mod ext_earn {
    use super::*;

    // Admin instructions

    pub fn initialize(ctx: Context<Initialize>, earn_authority: Pubkey) -> Result<()> {
        instructions::admin::initialize::handler(ctx, earn_authority)
    }

    pub fn set_earn_authority(
        ctx: Context<SetEarnAuthority>,
        new_earn_authority: Pubkey,
    ) -> Result<()> {
        instructions::admin::set_earn_authority::handler(ctx, new_earn_authority)
    }

    pub fn add_earn_manager(
        ctx: Context<AddEarnManager>,
        earn_manager: Pubkey,
        fee_bps: u64,
    ) -> Result<()> {
        instructions::admin::add_earn_manager::handler(ctx, earn_manager, fee_bps)
    }

    pub fn remove_earn_manager(ctx: Context<RemoveEarnManager>) -> Result<()> {
        instructions::admin::remove_earn_manager::handler(ctx)
    }

    // Earn authority instructions

    pub fn claim_for<'b: 'info, 'info>(
        ctx: Context<'_, 'b, '_, 'info, ClaimFor<'info>>,
        snapshot_balance: u64,
    ) -> Result<()> {
        instructions::earn_authority::claim_for::handler(ctx, snapshot_balance)
    }

    pub fn sync(ctx: Context<Sync>) -> Result<()> {
        instructions::earn_authority::sync::handler(ctx)
    }

    // Earn manager instructions

    pub fn add_earner(ctx: Context<AddEarner>, user: Pubkey) -> Result<()> {
        instructions::earn_manager::add_earner::handler(ctx, user)
    }

    pub fn remove_earner(ctx: Context<RemoveEarner>) -> Result<()> {
        instructions::earn_manager::remove_earner::handler(ctx)
    }

    pub fn configure_earn_manager(
        ctx: Context<ConfigureEarnManager>,
        fee_bps: Option<u64>,
    ) -> Result<()> {
        instructions::earn_manager::configure::handler(ctx, fee_bps)
    }

    pub fn transfer_earner(ctx: Context<TransferEarner>, to_earn_manager: Pubkey) -> Result<()> {
        instructions::earn_manager::transfer_earner::handler(ctx, to_earn_manager)
    }

    // Earner (or their Earn Manager) instructions

    pub fn set_recipient(ctx: Context<SetRecipient>) -> Result<()> {
        instructions::earner::set_recipient::handler(ctx)
    }

    // Open instructions

    pub fn wrap(ctx: Context<Wrap>, amount: u64) -> Result<()> {
        instructions::open::wrap::handler(ctx, amount)
    }

    pub fn unwrap(ctx: Context<Unwrap>, amount: u64) -> Result<()> {
        instructions::open::unwrap::handler(ctx, amount)
    }

    pub fn remove_orphaned_earner(ctx: Context<RemoveOrphanedEarner>) -> Result<()> {
        instructions::open::remove_orphaned_earner::handler(ctx)
    }
}
