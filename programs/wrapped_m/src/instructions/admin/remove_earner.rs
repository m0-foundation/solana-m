// wrapped-m/instructions/admin/remove_earner.rs

use anchor_lang::prelude::*;

use crate::{
    errors::wMError,
    state::{
        Global, GLOBAL_SEED,
        Earner, EARNER_SEED,
    }
};

#[derive(Accounts)]
pub struct RemoveEarner<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
        has_one = admin @ wMError::NotAuthorized,
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        mut,
        close = admin,
        seeds = [EARNER_SEED, earner_account.user_token_account.as_ref()],
        bump = earner_account.bump,
    )]
    pub earner_account: Account<'info, Earner>,

    pub system_program: Program<'info, System>,
}

pub fn handler(_ctx: Context<RemoveEarner>) -> Result<()> {
    Ok(())
}