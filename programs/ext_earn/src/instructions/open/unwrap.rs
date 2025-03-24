// ext_earn/instructions/open/unwrap.rs

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, Token2022};

use crate::{
    state::{
        M_VAULT_SEED,
        global::{ExtGlobal, EXT_GLOBAL_SEED},
    },
    utils::token::{burn_tokens, transfer_tokens_from_program},
};

#[derive(Accounts)]
pub struct Unwrap<'info> {
    pub signer: Signer<'info>,

    pub m_mint: InterfaceAccount<'info, Mint>,

    pub ext_mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [EXT_GLOBAL_SEED],
        bump = global_account.bump,
        has_one = m_mint,
        has_one = ext_mint,
    )]
    pub global_account: Account<'info, ExtGlobal>,

    /// CHECK: This account is validated by the seed, it stores no data
    #[account(
        seeds = [M_VAULT_SEED],
        bump = global_account.m_vault_bump,
    )]
    pub m_vault: AccountInfo<'info>,

    #[account(
        token::mint = m_mint,
        token::authority = signer,
    )]
    pub user_m_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = m_mint,
        token::authority = m_vault,
    )]
    pub vault_m_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = ext_mint,
        token::authority = signer,
    )]
    pub user_ext_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_2022: Program<'info, Token2022>, 
}

pub fn handler(ctx: Context<Unwrap>, amount: u64) -> Result<()> {
    // Burn the amount of ext tokens from the user
    burn_tokens(
        &ctx.accounts.user_ext_token_account, // from
        &amount, // amount
        &ctx.accounts.ext_mint, // mint
        &ctx.accounts.signer.to_account_info(), // authority
        &ctx.accounts.token_2022, // token program
    )?;

    // Transfer the amount of m tokens from the m vault to the user
    transfer_tokens_from_program(
        &ctx.accounts.vault_m_token_account, // from
        &ctx.accounts.user_m_token_account, // to
        &amount, // amount
        &ctx.accounts.m_mint, // mint
        &ctx.accounts.m_vault, // authority
        &[&[M_VAULT_SEED]], // authority seeds
        &ctx.accounts.token_2022, // token program
    )?;

    Ok(())
}