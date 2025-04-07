// no_earn/lib.rs - top-level program file

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

use instructions::*;

declare_id!("wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko");

#[program]
pub mod no_earn {
    use super::*;

    // Admin instructions

    pub fn claim_excess(ctx: Context<ClaimExcess>) -> Result<()> {
        instructions::admin::claim_excess::handler(ctx)
    }

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::admin::initialize::handler(ctx)
    }

    pub fn set_m_mint(ctx: Context<SetMMint>) -> Result<()> {
        instructions::admin::set_m_mint::handler(ctx)
    }
    // Open instructions

    // TODO add the option for permissioned wraps and unwraps?
    pub fn wrap(ctx: Context<Wrap>, amount: u64) -> Result<()> {
        instructions::open::wrap::handler(ctx, amount)
    }

    pub fn unwrap(ctx: Context<Unwrap>, amount: u64) -> Result<()> {
        instructions::open::unwrap::handler(ctx, amount)
    }
}
