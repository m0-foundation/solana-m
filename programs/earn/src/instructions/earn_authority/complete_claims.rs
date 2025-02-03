// earn/instructions/earn_authority/complete_claims.rs

// external depenencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    errors::EarnError,
    state::{Global, GLOBAL_SEED}
};


#[derive(Accounts)]
pub struct CompleteClaims<'info> {
    #[account(address = global.earn_authority)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        bump,
    )]
    pub global: Account<'info, Global>,
}

pub fn handler(ctx: Context<CompleteClaims>) -> Result<()> {
    // Validate that the latest claim cycle is not already completed
    if ctx.accounts.global.claim_complete {
        return err!(EarnError::NoActiveClaim);
    }

    // Set the claim_complete flag to true
    ctx.accounts.global.claim_complete = true;

    Ok(())
}

