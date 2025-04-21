// earn/instructions/open/remove_registrar_earner.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

// local dependencies
use crate::{
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
        has_one = user_token_account,
        seeds = [EARNER_SEED, earner_account.user_token_account.as_ref()],
        bump = earner_account.bump,
    )]
    pub earner_account: Account<'info, Earner>,

    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
}

pub fn handler(
    ctx: Context<RemoveRegistrarEarner>,
    proofs: Vec<Vec<ProofElement>>,
    neighbors: Vec<[u8; 32]>,
) -> Result<()> {
    // Verify the user is not in the approved earners list
    verify_not_in_tree(
        ctx.accounts.global_account.earner_merkle_root,
        ctx.accounts
            .user_token_account
            .clone()
            .into_inner()
            .owner
            .to_bytes(),
        proofs,
        neighbors,
    )?;

    Ok(())
}
