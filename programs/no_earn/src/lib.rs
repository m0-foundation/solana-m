// no_earn/lib.rs - top-level program file

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

use instructions::*;

declare_id!("2h2DMfS8iDZm4FoE2VadHmgde4cxfSB8MbYbXfwwpzcb");

#[program]
pub mod no_earn {
    use super::*;

    // Admin instructions

    pub fn claim_excess(ctx: Context<ClaimExcess>) -> Result<()> {
        instructions::admin::claim_excess::handler(ctx)
    }

    pub fn initialize(ctx: Context<Initialize>, wrap_authority: Pubkey) -> Result<()> {
        instructions::admin::initialize::handler(ctx, wrap_authority)
    }

    pub fn set_m_mint(ctx: Context<SetMMint>) -> Result<()> {
        instructions::admin::set_m_mint::handler(ctx)
    }

    pub fn set_wrap_authority(
        ctx: Context<SetWrapAuthority>,
        wrap_authority: Pubkey,
    ) -> Result<()> {
        instructions::admin::set_wrap_authority::handler(ctx, wrap_authority)
    }

    // Wrap authority instructions

    pub fn wrap(ctx: Context<Wrap>, amount: u64) -> Result<()> {
        instructions::wrap_authority::wrap::handler(ctx, amount)
    }

    pub fn unwrap(ctx: Context<Unwrap>, amount: u64) -> Result<()> {
        instructions::wrap_authority::unwrap::handler(ctx, amount)
    }
}
