use anchor_lang::{accounts::interface_account::InterfaceAccount, prelude::*};
use anchor_spl::{token::Token, token_interface::Mint};
use switchboard_on_demand::PullFeedAccountData;

use crate::{
    errors::SwapError,
    state::{Global, OracleConfig, Pool, SwapMode, GLOBAL_SEED, POOL_CONFIG_SEED},
};

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump,
        has_one = admin,
    )]
    pub global: Account<'info, Global>,

    #[account(
        init,
        seeds = [POOL_CONFIG_SEED.as_bytes(), swap_mint_a.key().as_ref(), swap_mint_b.key().as_ref()],
        space = 8 + Pool::INIT_SPACE,
        bump,
        payer = admin,
    )]
    pub pool: Account<'info, Pool>,

    pub swap_mint_a: InterfaceAccount<'info, Mint>,

    pub swap_mint_b: InterfaceAccount<'info, Mint>,

    pub oracle_a: Option<AccountInfo<'info>>,

    pub oracle_b: Option<AccountInfo<'info>>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}

impl InitializePool<'_> {
    fn validate(&self, swap_mode: &SwapMode, trade_fee_bps: u16) -> Result<()> {
        if trade_fee_bps > 10_000 {
            return Err(ProgramError::InvalidArgument.into());
        }

        // swap pubkeys should be sorted to prevent duplicate pools
        if self.swap_mint_a.key().to_string() > self.swap_mint_b.key().to_string() {
            return Err(ProgramError::InvalidArgument.into());
        }

        if *swap_mode == SwapMode::Oracle && (self.oracle_a.is_none() || self.oracle_b.is_none()) {
            return err!(SwapError::MissingOracle);
        }

        // if only 1 oracle is provided
        if self.oracle_a.is_some() ^ self.oracle_b.is_some() {
            return err!(SwapError::MissingOracle);
        }

        // validate oracle
        for oracle in [&self.oracle_a, &self.oracle_b].iter() {
            if let Some(oracle) = oracle {
                let feed_account = oracle.data.borrow();
                let feed = PullFeedAccountData::parse(feed_account);

                let price = feed
                    .map_err(|_| SwapError::BadOracleData)?
                    .value(&Clock::get().map_err(|_| SwapError::BadOracleData)?)
                    .map_err(|_| SwapError::BadOracleData)?;

                msg!("oracle price: {:}", price);

                if price.is_sign_negative() {
                    return err!(SwapError::BadOracleData);
                }
            }
        }

        Ok(())
    }

    #[access_control(ctx.accounts.validate(&swap_mode, trade_fee_bps))]
    pub fn handler(ctx: Context<Self>, swap_mode: SwapMode, trade_fee_bps: u16) -> Result<()> {
        let oracle = if ctx.accounts.oracle_a.is_some() {
            Some(OracleConfig {
                oracle_a: ctx.accounts.oracle_a.as_ref().unwrap().key(),
                oracle_b: ctx.accounts.oracle_b.as_ref().unwrap().key(),
            })
        } else {
            None
        };

        ctx.accounts.pool.set_inner(Pool {
            swap_mint_a: ctx.accounts.swap_mint_a.key(),
            swap_mint_b: ctx.accounts.swap_mint_b.key(),
            swap_mode,
            trade_fee_bps,
            bump: ctx.bumps.pool,
            oracle,
        });

        Ok(())
    }
}
