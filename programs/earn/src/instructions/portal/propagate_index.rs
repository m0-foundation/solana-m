// earn/instructions/portal/propagate_index.rs

// external depenencies
use anchor_lang::prelude::*;

// local dependencies
use common::constants::MINT;
use crate::{
    errors::EarnError,
    constants::{PORTAL, REWARDS_SCALE},
    state::{Global, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct PropagateIndex<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        bump,
    )]
    pub global: Account<'info, Global>,

    #[account(
        address = MINT,
    )]
    pub mint: InterfaceAccount<'info, Mint>,
}

pub fn handler(ctx: Context<PropagateIndex>, new_index: u64, portal_account_bump: u8) -> Result<()> {
    // Validate that the signer is the Portal's PDA
    match Pubkey::create_program_address(
        &[b"portal", &[portal_account_bump]],
        PORTAL
    ) {
        Ok(_) => (),
        Err(_) => return err!(EarnError::NotAuthorized),
    };

    // Cache the current supply of the M token
    let current_supply = ctx.mint.supply()?;

    // Check if the previous claim cycle is complete AND the cooldown period has passed
    // If not, update the max_supply, if needed, and return
    let current_timestamp = Clock::get()?.unix_timestamp;
    if !ctx.global.claim_complete || current_timestamp < ctx.global.timestamp + ctx.global.claim_cooldown {
        if current_supply > ctx.global.max_supply {
            ctx.global.max_supply = current_supply;
        }
        return Ok(());
    }
    
    // Calculate the rewards per token between the previous and new index
    let rewards_per_token: u128 = REWARDS_SCALE
        .checked_mul(new_index.into()).unwrap()
        .checked_div(ctx.global.index.into()).unwrap();

    // Calculate the new max yield using the max supply (which has been updated on each call to this function)
    let max_yield: u64 = rewards_per_token
        .checked_mul(ctx.global.max_supply.into()).unwrap()
        .checked_div(REWARDS_SCALE).unwrap()
        .try_into().unwrap();

    // Update the global state
    ctx.global.index = new_index;
    ctx.global.timestamp = current_timestamp;
    ctx.global.rewards_per_token = rewards_per_token;
    ctx.global.max_supply = current_supply; // we set this to the current supply regardless of whether it is larger since we are starting a new cycle
    ctx.global.max_yield = max_yield;
    ctx.global.distributed = 0;
    ctx.global.claim_complete = false;

    Ok(())
}