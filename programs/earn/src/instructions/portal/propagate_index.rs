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
    transfer_amount: u64
) -> Result<()> {
    let global = &mut ctx.accounts.global_account;

    // We only want to start a new claim cycle if the conditions are correct.
    // If any of the following are true, then we do not start a cycle
    // - Prior claim cycle is not complete
    // - The cooldown period after the previous claim cycle has not passed
    // - The new index is less than or equal to the already seen index (there is no yield to claim)
    // In this case, we only check if the max observed supply for the next cycle needs to be updated
    // and return early.
    let current_timestamp: u64 = Clock::get()?.unix_timestamp.try_into().unwrap();
    let cooldown_target = global.timestamp + global.claim_cooldown;

    // Return early if the claim cycle is not complete or the cooldown period has not passed or the new index is less than or equal to the already seen index
    if !global.claim_complete || current_timestamp < cooldown_target || new_index <= global.index {
        return Ok(());
    }

    // Cache the current supply of the M token
    let current_supply_before_transfer = ctx.accounts.mint.supply.checked_sub(transfer_amount).unwrap();

    // Start a new claim cycle
    // We cast to a u128 for the multiplication to avoid potential overflows

    let mut period_max: u64 = (current_supply_before_transfer as u128)
        .checked_mul(new_index.into())
        .unwrap()
        .checked_div(global.index.into())
        .unwrap()
        .try_into()
        .unwrap();

    // Update the global state

    global.index = new_index;
    global.earner_merkle_root = earner_merkle_root;
    global.timestamp = current_timestamp;
    // global.max_supply = current_supply; // don't think we need it anymore

    // The new max yield is the leftover amount combined with the period max
    global.max_yield =  period_max - current_supply_before_transfer; // can't underflow because new_index > ctx.accounts.global.index
    global.distributed = 0;
    global.claim_complete = false;

    emit!(IndexUpdate {
        index: new_index,
        ts: current_timestamp,
        supply: current_supply_before_transfer,
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
