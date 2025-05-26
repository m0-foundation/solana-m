use anchor_lang::{accounts::interface_account::InterfaceAccount, prelude::*};
use anchor_spl::{
    token::{mint_to, MintTo, Token},
    token_interface::{Mint, TokenAccount},
};

use crate::{
    errors::SwapError,
    state::{
        ApprovedPoolActor, Global, Pool, SwapMode, GLOBAL_SEED, POOL_ACTOR, POOL_AUTH,
        POOL_CONFIG_SEED,
    },
};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(address = depositor.owner)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [POOL_ACTOR.as_bytes(), pool_config.key().as_ref()],
        bump = depositor.bump,
    )]
    pub depositor: Account<'info, ApprovedPoolActor>,

    #[account(
        seeds = [POOL_CONFIG_SEED.as_bytes(), swap_mint_a.key().as_ref(), swap_mint_b.key().as_ref()],
        bump = pool_config.bump,
        has_one = swap_mint_a,
        has_one = swap_mint_b,
    )]
    pub pool_config: Account<'info, Pool>,

    pub swap_mint_a: InterfaceAccount<'info, Mint>,

    pub swap_mint_b: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = swap_mint_a,
    )]
    pub depositor_token_account_a: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = swap_mint_b,
    )]
    pub depositor_token_account_b: InterfaceAccount<'info, TokenAccount>,

    pub oracle_a: Option<AccountInfo<'info>>,

    pub oracle_b: Option<AccountInfo<'info>>,

    pub token_program: Program<'info, Token>,
}

impl Deposit<'_> {
    fn validate(&self, amount_a: u64, amount_b: u64) -> Result<()> {
        if self.pool_config.oracle.is_some() {
            if amount_a > 0 && self.oracle_a.is_none() {
                return err!(SwapError::MissingOracle);
            }
            if amount_b > 0 && self.oracle_b.is_none() {
                return err!(SwapError::MissingOracle);
            }
        }

        Ok(())
    }

    #[access_control(ctx.accounts.validate(amount_a, amount_b))]
    pub fn handler(ctx: Context<Self>, amount_a: u64, amount_b: u64) -> Result<()> {
        let lp_tokens = match ctx.accounts.pool_config.swap_mode {
            SwapMode::Pegged => amount_a + amount_b,
            SwapMode::Oracle => {
                // Mint USD value of tokens deposited

                1
            }
        };

        Ok(())
    }
}
