use anchor_lang::{accounts::interface_account::InterfaceAccount, prelude::*};
use anchor_spl::{token::Token, token_interface::Mint};

use crate::state::{Global, PoolConfig, GLOBAL_SEED, LP_MINT_SEED, POOL_CONFIG_SEED};

#[derive(Accounts)]
#[instruction(seed: u8)]
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
        seeds = [POOL_CONFIG_SEED.as_bytes(), &[seed]],
        bump,
    )]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(
        init,
        seeds = [LP_MINT_SEED.as_bytes(), &[seed]],
        bump,
        payer = admin,
        mint::decimals = 6,
        mint::authority = global,
        mint::token_program = token_program,
    )]
    pub lp_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}

impl InitializePool<'_> {
    fn validate(&self, trade_fee_bps: u16, swap_mints: &[Pubkey]) -> Result<()> {
        if trade_fee_bps > 10_000 {
            return Err(ProgramError::InvalidArgument.into());
        }
        if swap_mints.len() > 10 {
            return Err(ProgramError::InvalidArgument.into());
        }

        Ok(())
    }

    #[access_control(ctx.accounts.validate(trade_fee_bps, &swap_mints))]
    pub fn handler(
        ctx: Context<Self>,
        seed: u8,
        trade_fee_bps: u16,
        swap_mints: Vec<Pubkey>,
    ) -> Result<()> {
        ctx.accounts.pool_config.set_inner(PoolConfig {
            trade_fee_bps,
            seed,
            bump: ctx.bumps.pool_config,
            lp_mint: ctx.accounts.lp_mint.key(),
            swap_mints: [Pubkey::default(); 10],
        });

        for (i, mint) in swap_mints.iter().enumerate() {
            ctx.accounts.pool_config.swap_mints[i] = *mint;
        }

        Ok(())
    }
}
