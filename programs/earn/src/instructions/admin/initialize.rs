// earn/instructions/admin/initialitze.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    constants::{ADMIN, ANCHOR_DISCRIMINATOR_SIZE},
    errors::EarnError,
    state::{Global, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        mut,
        address = ADMIN,
    )]
    pub signer: Signer<'info>,

    #[account(
        init,
        payer = signer,
        space = ANCHOR_DISCRIMINATOR_SIZE + Global::INIT_SPACE,
        seeds = [GLOBAL_SEED],
        bump
    )]
    pub global_account: Account<'info, Global>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    earn_authority: Pubkey,
    initial_index: u64,
    claim_cooldown: u64,
) -> Result<()> {
    // Check that the initial index is at least 1 (with 12 decimals)
    if initial_index < 1_000_000_000_000 {
        return err!(EarnError::InvalidParam);
    }

    // Initialize the global account
    let global = &mut ctx.accounts.global_account;
    global.earn_authority = earn_authority;
    global.index = initial_index;

    // TODO set this to 0 initially so we can call propagate immediately?
    let current_timestamp: u64 = Clock::get()?.unix_timestamp.try_into().unwrap();
    global.timestamp = current_timestamp;

    global.claim_cooldown = claim_cooldown;

    // Set the claim status to complete so that a new index can be propagated to start the first claim
    global.claim_complete = true;

    // We explicitly set these values to zero for clarity
    global.max_supply = 0;
    global.max_yield = 0;
    global.distributed = 0;

    // Initialize Merkle roots to zero - they will be set by the first propagate_index call
    global.earner_merkle_root = [0; 32];
    global.earn_manager_merkle_root = [0; 32];

    Ok(())
}
