// earn/instructions/open/remove_registrar_earner.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    errors::EarnError,
    state::{Earner, Global, EARNER_SEED, GLOBAL_SEED},
    utils::merkle_proof::{verify_not_in_tree, ProofElement},
};

#[derive(Accounts)]
pub struct RemoveRegistrarEarner<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        mut,
        close = signer,
        seeds = [EARNER_SEED, earner_account.user_token_account.as_ref()],
        bump = earner_account.bump,
    )]
    pub earner_account: Account<'info, Earner>,
}

pub fn handler(
    ctx: Context<RemoveRegistrarEarner>,
    proofs: Vec<Vec<ProofElement>>,
    neighbors: Vec<[u8; 32]>,
) -> Result<()> {
    // Verify the user is not in the approved earners list
    if !verify_not_in_tree(
        ctx.accounts.global_account.earner_merkle_root,
        ctx.accounts.earner_account.user.to_bytes(),
        proofs,
        neighbors,
    ) {
        return err!(EarnError::InvalidProof);
    }

    // Check that the earner does not have an earn_manager, if so, return an error
    if let Some(_) = ctx.accounts.earner_account.earn_manager {
        return err!(EarnError::NotAuthorized);
    }

    // Set the is earning flag on the earner account to false, even though it's being closed
    ctx.accounts.earner_account.is_earning = false;

    Ok(())
}
