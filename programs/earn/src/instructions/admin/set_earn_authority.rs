// earn/instructions/admin/set_earn_authority.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    constants::ADMIN,
    state::{Global, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct SetEarnAuthority<'info> {
    #[account(address = ADMIN)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        bump
    )]
    pub global_account: Account<'info, Global>,
}

pub fn handler(ctx: Context<SetEarnAuthority>, new_earn_authority: Pubkey) -> Result<()> {
    ctx.accounts.global_account.earn_authority = new_earn_authority;

    Ok(())
}
