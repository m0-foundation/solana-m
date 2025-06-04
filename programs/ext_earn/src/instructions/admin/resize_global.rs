use anchor_lang::prelude::*;

use crate::state::{ExtGlobal as ExtGlobalNew, EXT_GLOBAL_SEED};

// Old foramt so anchor can parse the account
#[account]
#[derive(InitSpace)]
pub struct ExtGlobal {
    pub admin: Pubkey,
    pub earn_authority: Pubkey,
    pub ext_mint: Pubkey,
    pub m_mint: Pubkey,
    pub m_earn_global_account: Pubkey,
    pub index: u64,
    pub timestamp: u64,
    pub bump: u8,
    pub m_vault_bump: u8,
    pub ext_mint_authority_bump: u8,
}

#[derive(Accounts)]
pub struct ResizeGlobal<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [EXT_GLOBAL_SEED],
        bump,
        realloc = ExtGlobalNew::size(0),
        realloc::payer = admin,
        realloc::zero = false,
        // check if the account has been resized from old format
        constraint = global_account.to_account_info().data_len() == ExtGlobal::INIT_SPACE + 8,
    )]
    pub global_account: Account<'info, ExtGlobal>,

    pub system_program: Program<'info, System>,
}

pub fn handler(_: Context<ResizeGlobal>) -> Result<()> {
    Ok(())
}
