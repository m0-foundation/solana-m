// earn/instructions/open/remove_orphaned_earner.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    errors::EarnError,
    state::{EarnManager, Earner, EARNER_SEED, EARN_MANAGER_SEED},
};

#[derive(Accounts)]
pub struct RemoveOrphanedEarner<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [EARNER_SEED, earner_account.user.as_ref()],
        bump = earner_account.bump,
    )]
    pub earner_account: Account<'info, Earner>,

    #[account(
        seeds = [EARN_MANAGER_SEED, earner_account.earn_manager.unwrap().as_ref()],
        bump = earn_manager_account.bump
    )]
    pub earn_manager_account: Account<'info, EarnManager>,
}

pub fn handler(ctx: Context<RemoveOrphanedEarner>) -> Result<()> {
    // Check that the earn manager is not active
    // If it is, then earners cannot be removed
    if ctx.accounts.earn_manager_account.is_active {
        return err!(EarnError::NotAuthorized);
    }

    // Set the is_earning status to false
    ctx.accounts.earner_account.is_earning = false;

    Ok(())
}
