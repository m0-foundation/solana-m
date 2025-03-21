// wrapped-m/instructions/admin/set_earn_authority.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    errors::wMError,
    state::{Global, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct SetEarnAuthority<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        has_one = admin @ wMError::NotAuthorized,
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, Global>,
}

pub fn handler(ctx: Context<SetEarnAuthority>, new_earn_authority: Pubkey) -> Result<()> {
    ctx.accounts.global_account.earn_authority = new_earn_authority;

    Ok(())
}
