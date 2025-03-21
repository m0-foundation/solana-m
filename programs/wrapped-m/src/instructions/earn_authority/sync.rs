// wrapped-m/instructions/earn_authority/sync.rs

use anchor_lang::prelude::*;

use crate::{
    errors::wMError,
    state::{Global, GLOBAL_SEED},
    utils::earn_global::load_earn_global_data,
};

#[derive(Accounts)]
pub struct Sync<'info> {
    pub admin: Signer<'info>,

    pub m_earn_global_account: AccountInfo<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
        has_one = admin @ wMError::NotAuthorized,
        has_one = m_earn_global_account,        
    )]
    pub global_account: Account<'info, Global>,
}

pub fn handler(ctx: Context<Sync>) -> Result<()> {
    // Load the M earn program's global state to get the current index
    let m_earn_global = load_earn_global_data(&ctx.accounts.m_earn_global_account)?;

    // Update the local data
    ctx.accounts.global_account.index = m_earn_global.index;
    ctx.accounts.global_account.timestamp = m_earn_global.timestamp;

    Ok(())
}


