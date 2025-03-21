// earn/instructions/admin/initialitze.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    constants::ANCHOR_DISCRIMINATOR_SIZE,
    constants::PORTAL_PROGRAM,
    errors::EarnError,
    state::{Global, GLOBAL_SEED, TOKEN_AUTHORITY_SEED},
};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = ANCHOR_DISCRIMINATOR_SIZE + Global::INIT_SPACE,
        seeds = [GLOBAL_SEED],
        bump
    )]
    pub global_account: Account<'info, Global>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    mint: Pubkey,
    earn_authority: Pubkey,
    initial_index: u64,
    claim_cooldown: u64,
) -> Result<()> {
    // Check that the initial index is at least 1 (with 12 decimals)
    if initial_index < 1_000_000_000_000 {
        return err!(EarnError::InvalidParam);
    }

    // Portal authority that will propagate index and roots
    let portal_authority = Pubkey::find_program_address(&[TOKEN_AUTHORITY_SEED], &PORTAL_PROGRAM).0;

    ctx.accounts.global_account.set_inner(Global {
        admin: ctx.accounts.admin.key(),
        earn_authority,
        portal_authority,
        mint,
        index: initial_index,
        timestamp: 0, // Set this to 0 initially so we can call propagate immediately
        claim_cooldown,
        max_supply: 0,
        max_yield: 0,
        distributed: 0,
        claim_complete: true,
        earner_merkle_root: [0; 32],
        earn_manager_merkle_root: [0; 32],
        bump: ctx.bumps.global_account,
    });

    Ok(())
}
