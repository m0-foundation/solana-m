// earn/instructions/admin/initialitze.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use common::constants::{ANCHOR_DISCRIMINATOR_SIZE, ADMIN, ONE};
use crate::{
    errors::EarnError,
    state::{Global, GLOBAL_SEED}
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
    claim_cooldown: u64
) -> Result<()> {

    // Check that the initial index is at least 1
    if initial_index < ONE {
        return err!(EarnError::InvalidParam);
    }

    // Initialize the global account
    let global = &mut ctx.accounts.global_account;
    global.earn_authority = earn_authority;
    global.index = initial_index;
    
    let current_timestamp: u64 = Clock::get()?.unix_timestamp.try_into().unwrap();
    global.timestamp = current_timestamp;

    global.claim_cooldown = claim_cooldown;

    // Set the claim status to complete so that a new index can be propagated to start the first claim
    global.claim_complete = true;
    
    // We explicitly set these values to zero for clarity
    global.rewards_per_token = 0;
    global.max_supply = 0;
    global.max_yield = 0;
    global.distributed = 0;
    
    Ok(())
}
