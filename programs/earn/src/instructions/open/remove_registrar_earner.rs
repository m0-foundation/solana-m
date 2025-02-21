// earn/instructions/open/remove_registrar_earner.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

// local dependencies
use crate::{
    constants::MINT,
    errors::EarnError,
    state::{
        Earner, EARNER_SEED,
        Global, GLOBAL_SEED
    },
    utils::merkle_proof::{ProofElement, verify_not_in_tree}
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct RemoveRegistrarEarner<'info> {
    pub signer: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        token::mint = MINT,
        token::authority = user,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        close = signer,
        seeds = [EARNER_SEED, user_token_account.key().as_ref()],
        bump
    )]
    pub earner_account: Account<'info, Earner>,
}

pub fn handler(
    ctx: Context<RemoveRegistrarEarner>,
    user: Pubkey,
    proofs: Vec<Vec<ProofElement>>,
    neighbors: Vec<[u8; 32]>) -> Result<()> {
    // Verify the user is not in the approved earners list
    if !verify_not_in_tree(
        ctx.accounts.global_account.earner_merkle_root,
        user.to_bytes(),
        proofs,
        neighbors
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
