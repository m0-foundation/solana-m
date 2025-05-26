use anchor_lang::{accounts::interface_account::InterfaceAccount, prelude::*};
use anchor_spl::{
    token::Token,
    token_2022::MintToChecked,
    token_interface::{mint_to_checked, transfer_checked, Mint, TokenAccount, TransferChecked},
};

use crate::state::{ApprovedPoolActor, Pool, LP_MINT_SEED, POOL_ACTOR, POOL_CONFIG_SEED};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(address = depositor.owner)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [POOL_ACTOR, pool.key().as_ref()],
        bump = depositor.bump,
    )]
    pub depositor: Account<'info, ApprovedPoolActor>,

    #[account(
        seeds = [POOL_CONFIG_SEED, pool.swap_mint_a.key().as_ref(), pool.swap_mint_b.key().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        constraint = pool.swap_mint_a == mint.key() || pool.swap_mint_b == mint.key(),
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        seeds = [LP_MINT_SEED, pool.key().as_ref(), mint.key().as_ref()],
        bump,
    )]
    pub lp_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

impl Deposit<'_> {
    fn validate(&self) -> Result<()> {
        Ok(())
    }

    #[access_control(ctx.accounts.validate())]
    pub fn handler(ctx: Context<Self>, amount: u64) -> Result<()> {
        let Deposit {
            mint,
            lp_mint,
            depositor_token_account,
            vault,
            token_program,
            ..
        } = ctx.accounts;

        // LP tokens to depositor for position
        let lp_tokens = (amount as u128)
            .checked_mul(lp_mint.supply as u128)
            .and_then(|x| x.checked_div(depositor_token_account.amount as u128))
            .expect("underflow/overflow");

        let cpi_accounts = MintToChecked {
            mint: lp_mint.to_account_info(),
            to: vault.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        };
        let cpi_context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
        mint_to_checked(cpi_context, lp_tokens.try_into().unwrap(), lp_mint.decimals)?;

        // Transfer tokens to vault
        let cpi_accounts = TransferChecked {
            mint: mint.to_account_info(),
            from: depositor_token_account.to_account_info(),
            to: vault.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        };
        let cpi_context = CpiContext::new(token_program.to_account_info(), cpi_accounts);
        transfer_checked(cpi_context, amount, mint.decimals)?;

        msg!("Deposited {} tokens for {} LP tokens", amount, lp_tokens);

        Ok(())
    }
}
