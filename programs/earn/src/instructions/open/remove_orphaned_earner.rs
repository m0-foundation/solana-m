// earn/instructions/open/remove_orphaned_earner.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

// local dependencies
use crate::{
    constants::MINT,
    errors::EarnError,
    state::{Earner, EARNER_SEED, EarnManager, EARN_MANAGER_SEED}
};

#[derive(Accounts)]
pub struct RemoveOrphanedEarner<'info> {
    pub signer: Signer<'info>,

    #[account(token::mint = MINT)]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        close = signer,
        seeds = [EARNER_SEED, user_token_account.key().as_ref()],
        bump
    )]
    pub earner_account: Account<'info, Earner>,

    #[account(
        seeds = [EARN_MANAGER_SEED, earner_account.earn_manager.unwrap().as_ref()],
        bump
    )]
    pub earn_manager_account: Account<'info, EarnManager>,
}

pub fn handler(ctx: Context<RemoveOrphanedEarner>) -> Result<()> {
    // Check that the earner has an earn manager
    // If not, then it cannot be removed by this method
    // The validation of the earn manager in the context
    // doesn't check that earner_account.earn_manager is not
    // None, so we need to check it here
    if ctx.accounts.earner_account.earn_manager.is_none() {
        return err!(EarnError::NotAuthorized);
    }

    // Check that the earn manager is not active
    // If it is, then earners cannot be removed
    if ctx.accounts.earn_manager_account.is_active {
        return err!(EarnError::NotAuthorized);
    }

    // Set the is_earning status to false
    ctx.accounts.earner_account.is_earning = false;

    Ok(())
}
