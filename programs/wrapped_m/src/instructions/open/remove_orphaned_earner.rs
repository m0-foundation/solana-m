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
        close = signer,
        seeds = [EARNER_SEED, earner_account.user_token_account.as_ref()],
        bump = earner_account.bump,
    )]
    pub earner_account: Account<'info, Earner>,

    #[account(
        constraint = !earn_manager_account.is_active @ EarnError::NotAuthorized,
        seeds = [EARN_MANAGER_SEED, earner_account.earn_manager.unwrap().as_ref()],
        bump = earn_manager_account.bump
    )]
    pub earn_manager_account: Account<'info, EarnManager>,
}

pub fn handler(_ctx: Context<RemoveOrphanedEarner>) -> Result<()> {
    Ok(())
}
