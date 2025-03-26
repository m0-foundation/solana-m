// wrapped-m/instructions/earn_authority/sync.rs

use anchor_lang::prelude::*;

use crate::{
    errors::ExtError,
    state::{ExtGlobal, EXT_GLOBAL_SEED},
};
use earn::{
    state::{Global as EarnGlobal},
};

#[derive(Accounts)]
pub struct Sync<'info> {
    pub earn_authority: Signer<'info>,

    pub m_earn_global_account: Account<'info, EarnGlobal>,

    #[account(
        mut,
        seeds = [EXT_GLOBAL_SEED],
        bump = global_account.bump,
        has_one = earn_authority @ ExtError::NotAuthorized,
        has_one = m_earn_global_account @ ExtError::InvalidAccount,        
    )]
    pub global_account: Account<'info, ExtGlobal>,
}

pub fn handler(ctx: Context<Sync>) -> Result<()> {
    // Update the local data
    ctx.accounts.global_account.index = ctx.accounts.m_earn_global_account.index;
    ctx.accounts.global_account.timestamp = ctx.accounts.m_earn_global_account.timestamp;

    Ok(())
}