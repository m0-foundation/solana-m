// earn/instructions/earn_authority/complete_claims.rs

// external depenencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    errors::EarnError,
    state::{Global, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct CompleteClaims<'info> {
    pub earn_authority: Signer<'info>,

    #[account(
        mut,
        has_one = earn_authority @ EarnError::NotAuthorized,
        seeds = [GLOBAL_SEED],
        bump,
    )]
    pub global_account: Account<'info, Global>,
}

pub fn handler(ctx: Context<CompleteClaims>) -> Result<()> {
    // Validate that the latest claim cycle is not already completed
    if ctx.accounts.global_account.claim_complete {
        return err!(EarnError::NoActiveClaim);
    }

    // Set the claim_complete flag to true
    ctx.accounts.global_account.claim_complete = true;

    Ok(())
}
