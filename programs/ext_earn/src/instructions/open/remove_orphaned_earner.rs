// ext_earn/instructions/open/remove_orphaned_earner.rs

use anchor_lang::prelude::*;

use crate::{
    errors::ExtError,
    state::{EarnManager, Earner, ExtGlobal, EARNER_SEED, EARN_MANAGER_SEED, EXT_GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct RemoveOrphanedEarner<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [EXT_GLOBAL_SEED],
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, ExtGlobal>,

    #[account(
        mut,
        close = signer,
        seeds = [EARNER_SEED, earner_account.user_token_account.as_ref()],
        bump = earner_account.bump,
    )]
    pub earner_account: Account<'info, Earner>,

    #[account(
        constraint = !earn_manager_account.is_active @ ExtError::Active,
        seeds = [EARN_MANAGER_SEED, earner_account.earn_manager.as_ref()],
        bump = earn_manager_account.bump,
    )]
    pub earn_manager_account: Account<'info, EarnManager>,

    pub system_program: Program<'info, System>,
}

pub fn handler(_ctx: Context<RemoveOrphanedEarner>) -> Result<()> {
    Ok(())
}
