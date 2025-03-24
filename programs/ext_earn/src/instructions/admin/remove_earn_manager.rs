// ext_earn/instructions/admin/remove_earn_manager.rs

use anchor_lang::prelude::*;

use crate::state::{
    ExtGlobal, EXT_GLOBAL_SEED,
    EarnManager, EARN_MANAGER_SEED,
};

#[derive(Accounts)]
pub struct RemoveEarnManager<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [EXT_GLOBAL_SEED],
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, ExtGlobal>,

    #[account(
        mut,
        seeds = [EARN_MANAGER_SEED, earn_manager_account.earn_manager.as_ref()],
        bump = earn_manager_account.bump,
    )]
    pub earn_manager_account: Account<'info, EarnManager>,
}

pub fn handler(ctx: Context<RemoveEarnManager>) -> Result<()> {
    // We set the is_active flag to false instead of closing the account to avoid issues
    // with earner instructions which require the earn manager account
    ctx.accounts.earn_manager_account.is_active = false;

    Ok(())
}