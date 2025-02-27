// earn/instructions/portal/propagate_index.rs

// external depenencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

// local dependencies
use crate::{
    constants::PORTAL_PROGRAM,
    errors::EarnError,
    state::{Global, GLOBAL_SEED, TOKEN_AUTHORITY_SEED},
};

#[derive(Accounts)]
pub struct PropagateIndex<'info> {
    #[account(
        constraint = signer.key() == global_account.admin || signer.key() == Pubkey::find_program_address(
            &[TOKEN_AUTHORITY_SEED],
            &PORTAL_PROGRAM
        ).0 @ EarnError::NotAuthorized,
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
    earn_manager_merkle_root: [u8; 32],
) -> Result<()> {
    // Cache the current supply of the M token
    let current_supply = ctx.accounts.mint.supply;

    // Check if the new index is greater than the previously seen index
    // If so, update the merkle roots if they are non-zero.
    // We don't necessarily need the second check if we know updates only come
    // from mainnet. However, it provides some protection against staleness
    // in the event non-zero roots are sent from another chain.
    if new_index >= ctx.accounts.global_account.index {
        if earner_merkle_root != [0u8; 32] {
            ctx.accounts.global_account.earner_merkle_root = earner_merkle_root;
        }
        if earn_manager_merkle_root != [0u8; 32] {
            ctx.accounts.global_account.earn_manager_merkle_root = earn_manager_merkle_root;
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

    if !ctx.accounts.global_account.claim_complete
        || current_timestamp
            < ctx.accounts.global_account.timestamp + ctx.accounts.global_account.claim_cooldown
        || new_index <= ctx.accounts.global_account.index
    {
        if current_supply > ctx.accounts.global_account.max_supply {
            ctx.accounts.global_account.max_supply = current_supply;
        }

        return Ok(());
    }

    // Start a new claim cycle

    // Calculate the new max yield using the max supply (which has been updated on each call to this function
    // We cast to a u128 for the multiplcation to avoid potential overflows
    let mut period_max: u64 = (ctx.accounts.global_account.max_supply as u128)
        .checked_mul(new_index.into())
        .unwrap()
        .checked_div(ctx.accounts.global_account.index.into())
        .unwrap()
        .try_into()
        .unwrap();
    period_max -= ctx.accounts.global_account.max_supply; // can't underflow because new_index > ctx.accounts.global.index

    // Update the global state
    ctx.accounts.global_account.index = new_index;
    ctx.accounts.global_account.timestamp = current_timestamp;
    ctx.accounts.global_account.max_supply = current_supply; // we set this to the current supply regardless of whether it is larger since we are starting a new cycle

    // Some max yield can be leftover from the previous period if yield was not claimed for some users.
    // To get the max yield for the next claim cycle, we take the difference between the current max yield
    // and what was distributed to get the leftover amount. Then, we add the new potential max yield to be
    // sent out.
    ctx.accounts.global_account.max_yield = ctx
        .accounts
        .global_account
        .max_yield
        .checked_sub(ctx.accounts.global_account.distributed)
        .unwrap() // can probably remove the checked sub since distributed can't be greater than max yield
        .checked_add(period_max)
        .unwrap();

    ctx.accounts.global_account.distributed = 0;
    ctx.accounts.global_account.claim_complete = false;

    msg!(
        "New claim cycle started | Index: {} | Timestamp: {}",
        new_index,
        ctx.accounts.global_account.max_yield
    );

    Ok(())
}
