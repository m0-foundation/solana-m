// earn/instructions/open/remove_earn_manager.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    constants::ZERO_BIT,
    errors::EarnError,
    state::{
        EarnManager, EARN_MANAGER_SEED,
        Global, GLOBAL_SEED
    },
    utils::merkle_proof::verify_not_in_tree,
};

#[derive(Accounts)]
#[instruction(earn_manager: Pubkey)]
pub struct RemoveEarnManager<'info> {
    pub signer: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        mut,
        seeds = [EARN_MANAGER_SEED, earn_manager.as_ref()],
        bump
    )]
    pub earn_manager_account: Account<'info, EarnManager>,
}

pub fn handler(ctx: Context<RemoveEarnManager>, earn_manager: Pubkey, proof: Vec<[u8; 32]>, sibling: [u8; 32]) -> Result<()> {
    // Check that the earn_manager_account is active
    if !ctx.accounts.earn_manager_account.is_active {
        return err!(EarnError::NotAuthorized);
    }

    // Create the leaf for verification - this should match how the leaf was created when generating the Merkle tree
    let leaf = solana_program::keccak::hashv(&[&[ZERO_BIT],&earn_manager.to_bytes()]).to_bytes();

    // Verify the earn manager is not in the approved earn managers list
    if !verify_not_in_tree(proof, ctx.accounts.global_account.earn_manager_merkle_root, leaf, sibling) {
        return err!(EarnError::NotAuthorized);
    }
    
    // We do not close earn manager accounts when they are removed so that orphaned earners can be removed as well
    // Therefore, we just set the is_active flag to false
    ctx.accounts.earn_manager_account.is_active = false;

    Ok(())
}