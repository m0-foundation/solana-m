use anchor_lang::prelude::*;

use crate::state::{Global, GLOBAL_SEED};

#[derive(Accounts)]
pub struct InitializeGlobal<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        seeds = [GLOBAL_SEED.as_bytes()],
        space = 8 + Global::INIT_SPACE,
        payer = admin,
        bump,
    )]
    pub global: Account<'info, Global>,

    pub system_program: Program<'info, System>,
}

impl InitializeGlobal<'_> {
    fn validate(&self) -> Result<()> {
        Ok(())
    }

    #[access_control(ctx.accounts.validate())]
    pub fn handler(ctx: Context<Self>) -> Result<()> {
        ctx.accounts.global.set_inner(Global {
            admin: ctx.accounts.admin.key(),
            global_freeze: false,
            bump: ctx.bumps.global,
        });

        Ok(())
    }
}
