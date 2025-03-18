// earn/instructions/earn_manager/configure.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

// local dependencies
use crate::{
    constants::{ANCHOR_DISCRIMINATOR_SIZE, ONE_HUNDRED_PERCENT},
    errors::EarnError,
    state::{EarnManager, Global, EARN_MANAGER_SEED, GLOBAL_SEED},
    utils::merkle_proof::{verify_in_tree, ProofElement},
};

#[derive(Accounts)]
pub struct ConfigureEarnManager<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        init_if_needed,
        payer = signer,
        space = ANCHOR_DISCRIMINATOR_SIZE + EarnManager::INIT_SPACE,
        seeds = [EARN_MANAGER_SEED, signer.key().as_ref()],
        bump
    )]
    pub earn_manager_account: Account<'info, EarnManager>,

    #[account(token::mint = global_account.mint)]
    pub fee_token_account: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ConfigureEarnManager>,
    fee_bps: u64,
    proof: Vec<ProofElement>,
) -> Result<()> {
    // Verify the signer is an approved earn manager
    verify_in_tree(
        ctx.accounts.global_account.earn_manager_merkle_root,
        ctx.accounts.signer.key().to_bytes(),
        proof,
    )?;

    // Validate the fee percent is not greater than 100%
    if fee_bps > ONE_HUNDRED_PERCENT {
        return err!(EarnError::InvalidParam);
    }

    ctx.accounts.earn_manager_account.set_inner(EarnManager {
        is_active: true,
        fee_bps,
        fee_token_account: ctx.accounts.fee_token_account.key(),
        bump: ctx.bumps.earn_manager_account,
    });

    Ok(())
}
