use anchor_lang::{accounts::interface_account::InterfaceAccount, prelude::*};
use anchor_spl::{
    token::{mint_to, MintTo, Token},
    token_interface::Mint,
};

use crate::state::{Global, PoolConfig, GLOBAL_SEED, POOL_AUTH, POOL_CONFIG_SEED};

#[derive(Accounts)]
#[instruction(pool_seed: u8)]
pub struct Deposit<'info> {
    pub signer: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump,
    )]
    pub global: Account<'info, Global>,

    /// CHECK: authority on lp mints and vaults
    #[account(
        seeds = [POOL_AUTH.as_bytes(), &[pool_seed]],
        bump = pool_config.auth_bump,
    )]
    pub pool_auth: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [POOL_CONFIG_SEED.as_bytes(), &[pool_seed]],
        bump = pool_config.bump,
        has_one = lp_mint,
    )]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(mut)]
    pub lp_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

impl Deposit<'_> {
    fn validate(&self) -> Result<()> {
        Ok(())
    }

    #[access_control(ctx.accounts.validate())]
    pub fn handler(ctx: Context<Self>, pool_seed: u8, amount: u64) -> Result<()> {
        // Determine lp mint ratio
        let ratio = ctx.accounts.lp_mint.supply / ctx.accounts.pool_config.total_tokens;

        // Mint lp tokens to depositer
        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.lp_mint.to_account_info(),
                    to: to.to_account_info(),
                    authority: ctx.accounts.pool_auth.to_account_info(),
                },
                &[&[POOL_AUTH.as_bytes(), &[ctx.accounts.pool_config.auth_bump]]],
            ),
            amount * ratio,
        )?;

        // Transfer tokens to pool

        // Track total tokens in pool
        ctx.accounts.pool_config.total_tokens += amount;

        Ok(())
    }
}
