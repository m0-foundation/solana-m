// earn/instructions/open/remove_earn_manager.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    errors::EarnError,
    state::{EarnManager, Global, EARN_MANAGER_SEED, GLOBAL_SEED},
    utils::merkle_proof::{verify_not_in_tree, ProofElement},
};

#[derive(Accounts)]
#[instruction(earn_manager: Pubkey)]
pub struct RemoveEarnManager<'info> {
    pub signer: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        mut,
        constraint = earn_manager_account.is_active @ EarnError::NotAuthorized,
        seeds = [EARN_MANAGER_SEED, earn_manager.as_ref()],
        bump = earn_manager_account.bump
    )]
    pub earn_manager_account: Account<'info, EarnManager>,
}

pub fn handler(
    ctx: Context<RemoveEarnManager>,
    earn_manager: Pubkey,
    proofs: Vec<Vec<ProofElement>>,
    neighbors: Vec<[u8; 32]>,
) -> Result<()> {
    // Verify the earn manager is not in the approved earn managers list
    verify_not_in_tree(
        ctx.accounts.global_account.earn_manager_merkle_root,
        earn_manager.to_bytes(),
        proofs,
        neighbors,
    )?;

    // We do not close earn manager accounts when they are removed so that orphaned earners can be removed as well
    // Therefore, we just set the is_active flag to false
    ctx.accounts.earn_manager_account.is_active = false;

    Ok(())
}
