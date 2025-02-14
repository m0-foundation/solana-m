// earn/instructions/portal/propagate_index.rs

// external depenencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

// local dependencies
use crate::{
    errors::EarnError,
    constants::{MINT, PORTAL_SIGNER},
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
    pub global_account: Account<'info, Global>,

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
    // Also, check that the index is greater than the previously seen index
    // If not, update the max_supply, if needed, and return
    let current_timestamp: u64 = Clock::get()?.unix_timestamp.try_into().unwrap();
    if !ctx.accounts.global_account.claim_complete || current_timestamp < 
        ctx.accounts.global_account.timestamp + ctx.accounts.global_account.claim_cooldown
        || new_index <= ctx.accounts.global_account.index {
        if current_supply > ctx.accounts.global_account.max_supply {
            ctx.accounts.global_account.max_supply = current_supply;
        }
        // Update the Merkle roots even if we're not starting a new cycle
        // TODO need to think about this more
        // If the root is sent from an L2 with stale data, it could overwrite a more recent root
        // from mainnet. Do we need to store a separate timestamp for the roots?
        ctx.accounts.global_account.earner_merkle_root = earner_merkle_root;
        ctx.accounts.global_account.earn_manager_merkle_root = earn_manager_merkle_root;
        return Ok(());
    }

    // Calculate the new max yield using the max supply (which has been updated on each call to this function
    // We cast to a u128 for the multiplcation to avoid potential overflows
    let mut period_max: u64 = (ctx.accounts.global_account.max_supply as u128)
        .checked_mul(new_index.into()).unwrap()
        .checked_div(ctx.accounts.global_account.index.into()).unwrap()
        .try_into().unwrap();
    period_max -= ctx.accounts.global_account.max_supply; // can't underflow because new_index > ctx.accounts.global.index

    // Update the global state
    ctx.accounts.global_account.index = new_index;
    ctx.accounts.global_account.timestamp = current_timestamp;
    ctx.accounts.global_account.max_supply = current_supply; // we set this to the current supply regardless of whether it is larger since we are starting a new cycle
    
    // Some max yield can be leftover from the previous period if yield was not claimed for some users.
    // To get the max yield for the next claim cycle, we take the difference between the current max yield 
    // and what was distributed to get the leftover amount. Then, we add the new potential max yield to be
    // sent out. TODO confirm this won't get too large over time due to some users not earning.
    // Should this be set to max u64 if it will overflow?
    ctx.accounts.global_account.max_yield = ctx.accounts.global_account.max_yield
        .checked_sub(ctx.accounts.global_account.distributed).unwrap() // can probably remove the checked sub since distributed can't be greater than max yield
        .checked_add(period_max).unwrap();
    ctx.accounts.global_account.distributed = 0;
    ctx.accounts.global_account.claim_complete = false;
    ctx.accounts.global_account.earner_merkle_root = earner_merkle_root;
    ctx.accounts.global_account.earn_manager_merkle_root = earn_manager_merkle_root;

    Ok(())
}