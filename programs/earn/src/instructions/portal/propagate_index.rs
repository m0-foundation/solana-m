// earn/instructions/portal/propagate_index.rs

// external depenencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

// local dependencies
use crate::{
    errors::EarnError,
    constants::{MINT, PORTAL_SIGNER, REWARDS_SCALE},
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

pub fn handler(
    ctx: Context<PropagateIndex>, 
    new_index: u64,
    earner_merkle_root: [u8; 32],
    earn_manager_merkle_root: [u8; 32]
) -> Result<()> {
    // Validate that the signer is the Portal's PDA
    if ctx.accounts.signer.key() != PORTAL_SIGNER {
        return err!(EarnError::NotAuthorized);
    }

    // Cache the current supply of the M token
    let current_supply = ctx.accounts.mint.supply;

    // Check if the previous claim cycle is complete AND the cooldown period has passed
    // If not, update the max_supply, if needed, and return
    let current_timestamp: u64 = Clock::get()?.unix_timestamp.try_into().unwrap();
    if !ctx.accounts.global.claim_complete || current_timestamp < 
        ctx.accounts.global.timestamp + ctx.accounts.global.claim_cooldown {
        if current_supply > ctx.accounts.global.max_supply {
            ctx.accounts.global.max_supply = current_supply;
        }
        // Update the Merkle roots even if we're not starting a new cycle
        ctx.accounts.global.earner_merkle_root = earner_merkle_root;
        ctx.accounts.global.earn_manager_merkle_root = earn_manager_merkle_root;
        return Ok(());
    }
    
    // Calculate the rewards per token between the previous and new index
    let rewards_per_token: u128 = REWARDS_SCALE
        .checked_mul(new_index.into()).unwrap()
        .checked_div(ctx.accounts.global.index.into()).unwrap();

    // Calculate the new max yield using the max supply (which has been updated on each call to this function)
    let max_yield: u64 = rewards_per_token
        .checked_mul(ctx.accounts.global.max_supply.into()).unwrap()
        .checked_div(REWARDS_SCALE).unwrap()
        .try_into().unwrap();

    // Update the global state
    ctx.accounts.global.index = new_index;
    ctx.accounts.global.timestamp = current_timestamp;
    ctx.accounts.global.rewards_per_token = rewards_per_token;
    ctx.accounts.global.max_supply = current_supply; // we set this to the current supply regardless of whether it is larger since we are starting a new cycle
    ctx.accounts.global.max_yield = max_yield;
    ctx.accounts.global.distributed = 0;
    ctx.accounts.global.claim_complete = false;
    ctx.accounts.global.earner_merkle_root = earner_merkle_root;
    ctx.accounts.global.earn_manager_merkle_root = earn_manager_merkle_root;

    Ok(())
}