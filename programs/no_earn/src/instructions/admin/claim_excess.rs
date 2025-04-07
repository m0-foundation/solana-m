// no_earn/instructions/admin/claim_excess.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount};

// local dependencies
use crate::{
    errors::ExtError,
    state::{ExtGlobal, EXT_GLOBAL_SEED, M_VAULT_SEED},
    utils::token::transfer_tokens_from_program,
};

#[derive(Accounts)]
pub struct ClaimExcess<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [EXT_GLOBAL_SEED],
        has_one = admin @ ExtError::NotAuthorized,
        has_one = m_mint @ ExtError::InvalidAccount,
        has_one = ext_mint @ ExtError::InvalidAccount,
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, ExtGlobal>,

    pub m_mint: InterfaceAccount<'info, Mint>,

    pub ext_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: There is no data in this account, it is validated by the seed
    #[account(
        seeds = [M_VAULT_SEED],
        bump = global_account.m_vault_bump,
    )]
    pub m_vault_account: AccountInfo<'info>,

    #[account(
        mut,
        associated_token::mint = m_mint,
        associated_token::authority = m_vault_account,
    )]
    pub vault_m_token_account: InterfaceAccount<'info, TokenAccount>,

    // TODO should we require setting this pubkey in the global account?
    // Allowing admin to specify within the instruction is more flexible
    #[account(
        mut,
        token::mint = m_mint,
    )]
    pub recipient_m_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_2022: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<ClaimExcess>) -> Result<()> {
    // Excess M is the amount of M in the vault above the amount needed to fully collateralize the extension
    let ext_supply = ctx.accounts.ext_mint.supply;
    let vault_balance = ctx.accounts.vault_m_token_account.amount;

    let excess = vault_balance
        .checked_sub(ext_supply)
        .ok_or(ExtError::InsufficientCollateral)?; // This should never underflow, but we check just in case

    transfer_tokens_from_program(
        &ctx.accounts.vault_m_token_account,
        &ctx.accounts.recipient_m_token_account,
        excess,
        &ctx.accounts.m_mint,
        &ctx.accounts.m_vault_account,
        &[&[M_VAULT_SEED, &[ctx.accounts.global_account.m_vault_bump]]],
        &ctx.accounts.token_2022,
    )?;

    // TODO emit event?

    Ok(())
}
