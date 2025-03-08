// earn/instructions/earn_manager/add_earner.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

// local dependencies
use crate::{
    constants::ANCHOR_DISCRIMINATOR_SIZE,
    errors::EarnError,
    state::{EarnManager, Earner, Global, EARNER_SEED, EARN_MANAGER_SEED, GLOBAL_SEED},
    utils::merkle_proof::{verify_not_in_tree, ProofElement},
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct AddEarner<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        constraint = earn_manager_account.is_active @ EarnError::NotAuthorized,
        seeds = [EARN_MANAGER_SEED, signer.key().as_ref()],
        bump = earn_manager_account.bump
    )]
    pub earn_manager_account: Account<'info, EarnManager>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        token::mint = global_account.mint,
        token::authority = user,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = signer,
        space = ANCHOR_DISCRIMINATOR_SIZE + Earner::INIT_SPACE,
        seeds = [EARNER_SEED, user_token_account.key().as_ref()],
        bump
    )]
    pub earner_account: Account<'info, Earner>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<AddEarner>,
    user: Pubkey,
    proofs: Vec<Vec<ProofElement>>,
    neighbors: Vec<[u8; 32]>,
) -> Result<()> {
    // Verify the user is not already an earner
    if !verify_not_in_tree(
        ctx.accounts.global_account.earner_merkle_root,
        user.to_bytes(),
        proofs,
        neighbors,
    ) {
        return err!(EarnError::InvalidProof);
    }

    ctx.accounts.earner_account.set_inner(Earner {
        earn_manager: Some(ctx.accounts.signer.key().clone()),
        recipient_token_account: None,
        last_claim_index: ctx.accounts.global_account.index,
        last_claim_timestamp: Clock::get()?.unix_timestamp.try_into().unwrap(),
        is_earning: true,
        bump: ctx.bumps.earner_account,
        user,
        user_token_account: ctx.accounts.user_token_account.key(),
    });

    Ok(())
}
