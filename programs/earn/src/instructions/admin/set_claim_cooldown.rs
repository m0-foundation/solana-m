// earn/instructions/admin/set_claim_cooldown.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    errors::EarnError,
    state::{Global, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct SetClaimCooldown<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        has_one = admin @ EarnError::NotAuthorized,
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, Global>,
}

pub fn handler(ctx: Context<SetEarnAuthority>, claim_cooldown: u64) -> Result<()> {
    // Do not allow a cooldown longer than 1 week
    if claim_cooldown > 604800 {
        return err!(EarnError::InvalidParam);
    }

    ctx.accounts.global_account.claim_cooldown = claim_cooldown;

    Ok(())
}
