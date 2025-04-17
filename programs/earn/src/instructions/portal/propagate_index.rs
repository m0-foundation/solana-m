// earn/instructions/portal/propagate_index.rs

// external depenencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

// local dependencies
use crate::{
    errors::EarnError,
    state::{Global, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct PropagateIndex<'info> {
    #[account(
        constraint = signer.key() == global_account.portal_authority
            || (cfg!(feature = "testing") && signer.key() == global_account.admin) @ EarnError::NotAuthorized 
    )]
    pub signer: Signer<'info>,

    #[account(
        mut,
        has_one = mint,
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, Global>,

    pub mint: InterfaceAccount<'info, Mint>,
}

pub fn handler(
    ctx: Context<PropagateIndex>,
    new_index: u64,
    earner_merkle_root: [u8; 32],
) -> Result<()> {
    let global = &mut ctx.accounts.global_account;

    // Cache the current supply of the M token
    let current_supply = ctx.accounts.mint.supply;

    // Check if the new index is greater than or equal to the previously seen index.
    // If so, update the merkle roots if they are non-zero.
    // We don't necessarily need the second check if we know updates only come
    // from mainnet. However, it provides some protection against staleness
    // in the event non-zero roots are sent from another chain.
    if new_index >= global.index {
        if earner_merkle_root != [0u8; 32] {
            global.earner_merkle_root = earner_merkle_root;
        }
    }

    // We only want to start a new claim cycle if the conditions are correct.
    // If any of the following are true, then we do not start a cycle
    // - Prior claim cycle is not complete
    // - The cooldown period after the previous claim cycle has not passed
    // - The new index is less than or equal to the already seen index (there is no yield to claim)
    // In this case, we only check if the max observed supply for the next cycle needs to be updated
    // and return early.
    let current_timestamp: u64 = Clock::get()?.unix_timestamp.try_into().unwrap();
    let cooldown_target = global.timestamp + global.claim_cooldown;

    if !global.claim_complete || current_timestamp < cooldown_target || new_index <= global.index {
        if current_supply > global.max_supply {
            global.max_supply = current_supply;
        }

        return Ok(());
    }

    // Start a new claim cycle

    // Calculate the new max yield using the max supply (which has been updated on each call to this function
    // We cast to a u128 for the multiplcation to avoid potential overflows

    // Some max yield can be leftover from the previous period if yield was not claimed for some users. We
    // need to compound yield on the leftover amount for the next cycle.
    // To get the max yield for the next claim cycle, we take the difference between the current max yield
    // and what was distributed to get the leftover amount. Then, we add the new potential max yield to be
    // sent out.
    let leftover = ctx
        .accounts
        .global_account
        .max_yield
        .checked_sub(global.distributed)
        .unwrap();

    let mut period_max: u64 = (global.max_supply as u128)
        .checked_add(leftover as u128)
        .unwrap()
        .checked_mul(new_index.into())
        .unwrap()
        .checked_div(global.index.into())
        .unwrap()
        .try_into()
        .unwrap();

    period_max = period_max - global.max_supply - leftover; // can't underflow because new_index > ctx.accounts.global.index

    // Update the global state
    global.index = new_index;
    global.timestamp = current_timestamp;
    global.max_supply = current_supply; // we set this to the current supply regardless of whether it is larger since we are starting a new cycle

    // The new max yield is the leftover amount combined with the period max
    global.max_yield = leftover.checked_add(period_max).unwrap();

    global.distributed = 0;
    global.claim_complete = false;

    emit!(IndexUpdate {
        index: new_index,
        ts: current_timestamp,
        supply: current_supply,
        max_yield: global.max_yield,
    });

    Ok(())
}

#[event]
pub struct IndexUpdate {
    pub index: u64,
    pub ts: u64,
    pub supply: u64,
    pub max_yield: u64,
}
