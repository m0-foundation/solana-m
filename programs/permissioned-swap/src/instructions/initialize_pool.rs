use anchor_lang::{accounts::interface_account::InterfaceAccount, prelude::*};
use anchor_spl::{
    associated_token::get_associated_token_address, token::Token, token_interface::Mint,
};

use crate::state::{Global, PoolConfig, GLOBAL_SEED, LP_MINT_SEED, POOL_AUTH, POOL_CONFIG_SEED};

#[derive(Accounts)]
#[instruction(pool_seed: u8)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED.as_bytes()],
        bump = global.bump,
        has_one = admin,
    )]
    pub global: Account<'info, Global>,

    /// CHECK: authority on lp mints and vaults
    #[account(
        seeds = [POOL_AUTH.as_bytes(), &[pool_seed]],
        bump,
    )]
    pub pool_auth: UncheckedAccount<'info>,

    #[account(
        init,
        seeds = [POOL_CONFIG_SEED.as_bytes(), &[pool_seed]],
        space = 8 + PoolConfig::INIT_SPACE,
        bump,
        payer = admin,
    )]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(
        init,
        seeds = [LP_MINT_SEED.as_bytes(), &[pool_seed]],
        bump,
        payer = admin,
        mint::decimals = 6,
        mint::authority = pool_auth,
        mint::token_program = token_program,
    )]
    pub lp_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}

impl InitializePool<'_> {
    fn validate(
        &self,
        trade_fee_bps: u16,
        swap_mints: &[Pubkey],
        remaining_accounts: &[AccountInfo<'_>],
    ) -> Result<()> {
        if trade_fee_bps > 10_000 {
            return Err(ProgramError::InvalidArgument.into());
        }
        if swap_mints.len() > 10 {
            return Err(ProgramError::InvalidArgument.into());
        }
        if remaining_accounts.len() != swap_mints.len() {
            return Err(ProgramError::InvalidArgument.into());
        }

        // Check that an associated token account was created for each mint
        for (i, mint) in swap_mints.iter().enumerate() {
            let token_account = get_associated_token_address(&self.pool_auth.key(), mint);

            if !token_account.eq(remaining_accounts[i].key) {
                return Err(ProgramError::InvalidArgument.into());
            }
            if remaining_accounts[i].data_is_empty() {
                return Err(ProgramError::InvalidArgument.into());
            }
        }

        Ok(())
    }

    #[access_control(ctx.accounts.validate(trade_fee_bps, &swap_mints, ctx.remaining_accounts))]
    pub fn handler(
        ctx: Context<Self>,
        pool_seed: u8,
        trade_fee_bps: u16,
        swap_mints: Vec<Pubkey>,
    ) -> Result<()> {
        ctx.accounts.pool_config.set_inner(PoolConfig {
            trade_fee_bps,
            seed: pool_seed,
            bump: ctx.bumps.pool_config,
            auth_bump: ctx.bumps.pool_auth,
            total_tokens: 0,
            lp_mint: ctx.accounts.lp_mint.key(),
            swap_mints: [Pubkey::default(); 10],
        });

        for (i, mint) in swap_mints.iter().enumerate() {
            ctx.accounts.pool_config.swap_mints[i] = *mint;
        }

        Ok(())
    }
}
