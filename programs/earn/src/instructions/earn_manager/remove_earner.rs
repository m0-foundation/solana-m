// earn/instructions/earn_manager/remove_earner.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    errors::EarnError,
    state::{EarnManager, Earner, Global, EARNER_SEED, EARN_MANAGER_SEED, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct RemoveEarner<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        mut,
        close = signer,
        seeds = [EARNER_SEED, earner_account.user_token_account.as_ref()],
        bump = earner_account.bump,
    )]
    pub earner_account: Account<'info, Earner>,

    #[account(
        mut,
        constraint = earn_manager_account.is_active @ EarnError::NotAuthorized,
        seeds = [EARN_MANAGER_SEED, signer.key().as_ref()],
        bump = earn_manager_account.bump
    )]
    pub earn_manager_account: Account<'info, EarnManager>,
}

pub fn handler(ctx: Context<RemoveEarner>) -> Result<()> {
    // Require that the earner has an earn manager
    // If not, it must be removed from the registrar
    // and a different instruction must be used
    if let Some(earn_manager) = ctx.accounts.earner_account.earn_manager {
        // Validate that the signer is the earn manager
        if ctx.accounts.signer.key() != earn_manager {
            return err!(EarnError::NotAuthorized);
        }
    } else {
        return err!(EarnError::NotAuthorized);
    }

    // Set the is_earning status to false
    ctx.accounts.earner_account.is_earning = false;

    Ok(())
}
