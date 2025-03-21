// wrapped-m/instructions/earn_authority/claim_for.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, Token2022};

// local dependencies
use crate::{
    errors::wMError,
    state::{
        Global, GLOBAL_SEED,
        Earner, EARNER_SEED,
        MINT_AUTHORITY_SEED,
        M_VAULT_SEED,
    },
    utils::token::mint_tokens,
};

#[derive(Accounts)]
pub struct ClaimFor<'info> {
    pub earn_authority: Signer<'info>,

    #[account(
        mut,
        has_one = ext_mint,
        has_one = earn_authority @ wMError::NotAuthorized,
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, Global>,

    #[account(mut)]
    pub ext_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: This account is validated by the seed, it stores no data
    #[account(
        seeds = [MINT_AUTHORITY_SEED],
        bump = global_account.ext_mint_authority_bump,
    )]
    pub ext_mint_authority: AccountInfo<'info>,

    /// CHECK: This account is validated by the seed, it stores no data
    #[account(
        seeds = [M_VAULT_SEED],
        bump = global_account.m_vault_bump,
    )]
    pub m_vault_account: AccountInfo<'info>,

    #[account(
        token::mint = global_account.m_mint,
        token::authority = m_vault_account,
    )]
    pub vault_m_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [EARNER_SEED, earner_account.user_token_account.as_ref()],
        bump = earner_account.bump,
    )]
    pub earner_account: Account<'info, Earner>,

    #[account(
        mut,
        address = match earner_account.recipient_token_account {
            Some(token_account) => token_account,
            None => earner_account.user_token_account,
        },       
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_2022: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<ClaimFor>, snapshot_balance: u64) -> Result<()> {
    // Validate that yield has not been claimed for the earner at the current index
    if ctx.accounts.earner_account.last_claim_index >= ctx.accounts.global_account.index {
        return err!(wMError::AlreadyClaimed);
    }

    // Calculate the amount of tokens to send to the user
    // Cast to u128 for multiplication to avoid overflows
    let mut rewards: u64 = (snapshot_balance as u128)
        .checked_mul(ctx.accounts.global_account.index.into())
        .unwrap()
        .checked_div(ctx.accounts.earner_account.last_claim_index.into())
        .unwrap()
        .try_into()
        .unwrap();

    rewards -= snapshot_balance; // can't underflow because global index > last claim index

    // Validate that the newly minted rewards will not make the extension undercollateralized
    let ext_supply = ctx.accounts.ext_mint.supply;
    let ext_collateral = ctx.accounts.vault_m_token_account.amount;

    if ext_supply < ext_collateral + rewards {
        return err!(wMError::InsufficientCollateral);
    }

    // Set the earner's last claim index to the global index and update the last claim timestamp
    ctx.accounts.earner_account.last_claim_index = ctx.accounts.global_account.index;
    ctx.accounts.earner_account.last_claim_timestamp = ctx.accounts.global_account.timestamp;

    // Mint the rewards to the user
    let mint_authority_seeds: &[&[&[u8]]] = &[&[
        MINT_AUTHORITY_SEED, &[ctx.accounts.global_account.ext_mint_authority_bump],
    ]];

    mint_tokens(
        &ctx.accounts.user_token_account, // to
        &rewards, // amount
        &ctx.accounts.ext_mint, // mint
        &ctx.accounts.ext_mint_authority, // authority
        mint_authority_seeds, // authority seeds
        &ctx.accounts.token_2022, // token program
    )?;

    Ok(())
}