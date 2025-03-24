// ext_earn/instructions/open/wrap.rs

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, Token2022};

use crate::{
    state::{
        M_VAULT_SEED,
        MINT_AUTHORITY_SEED,
        global::{ExtGlobal, EXT_GLOBAL_SEED},
    },
    utils::token::{mint_tokens, transfer_tokens},
};

#[derive(Accounts)]
pub struct Wrap<'info> {
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
        bump = global_account.m_vault_bump
    )]
    pub m_vault: AccountInfo<'info>,

    /// CHECK: This account is validated by the seed, it stores no data
    #[account(
        seeds = [MINT_AUTHORITY_SEED],
        bump = global_account.ext_mint_authority_bump,
    )]
    pub ext_mint_authority: AccountInfo<'info>,

    #[account(
        mut,
        token::mint = m_mint,
        token::authority = signer,
    )]
    pub user_m_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        token::mint = m_mint,
        token::authority = m_vault,
    )]
    pub vault_m_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        token::mint = ext_mint,
        token::authority = signer,
    )]
    pub user_ext_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_2022: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<Wrap>, amount: u64) -> Result<()> {
    // Transfer the amount of m tokens from the user to the m vault
    transfer_tokens(
        &ctx.accounts.user_m_token_account, // from
        &ctx.accounts.vault_m_token_account, // to
        &amount, // amount
        &ctx.accounts.m_mint, // mint
        &ctx.accounts.signer.to_account_info(), // authority
        &ctx.accounts.token_2022, // token program
    )?;

    // Mint the amount of ext tokens to the user
    mint_tokens(
        &ctx.accounts.user_ext_token_account, // to
        &amount, // amount
        &ctx.accounts.ext_mint, // mint
        &ctx.accounts.ext_mint_authority, // authority
        &[&[MINT_AUTHORITY_SEED]], // authority seeds
        &ctx.accounts.token_2022, // token program
    )?;

    Ok(())
}