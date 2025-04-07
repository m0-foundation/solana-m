// ext_earn/instructions/admin/set_m_mint.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022};

// local dependencies
use crate::{
    errors::ExtError,
    state::{ExtGlobal, EXT_GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct SetMMint<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [EXT_GLOBAL_SEED],
        has_one = admin @ ExtError::NotAuthorized,
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, ExtGlobal>,

    #[account(
        token::token_program = Token2022::id(),
    )]
    pub m_mint: InterfaceAccount<'info, Mint>,
}

pub fn handler(ctx: Context<SetMMint>) -> Result<()> {
    ctx.accounts.global_account.m_mint = ctx.accounts.m_mint.key();

    Ok(())
}
