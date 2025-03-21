// earn/instructins/open/add_earner.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

// local dependencies
use crate::{
    constants::ANCHOR_DISCRIMINATOR_SIZE,
    errors::EarnError,
    state::{Earner, Global, EARNER_SEED, GLOBAL_SEED},
    utils::merkle_proof::{verify_in_tree, ProofElement},
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct AddRegistrarEarner<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

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
        space = Earner::INIT_SPACE + ANCHOR_DISCRIMINATOR_SIZE,
        seeds = [EARNER_SEED, user_token_account.key().as_ref()],
        bump
    )]
    pub earner_account: Account<'info, Earner>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<AddRegistrarEarner>,
    user: Pubkey,
    proof: Vec<ProofElement>,
) -> Result<()> {
    // Verify the user is in the approved earners list
    if !verify_in_tree(
        ctx.accounts.global_account.earner_merkle_root,
        user.to_bytes(),
        proof,
    ) {
        return err!(EarnError::InvalidProof);
    }

    ctx.accounts.earner_account.set_inner(Earner {
        earn_manager: None,
        recipient_token_account: None,
        last_claim_index: ctx.accounts.global_account.index,
        last_claim_timestamp: Clock::get()?.unix_timestamp.try_into().unwrap(),
        bump: ctx.bumps.earner_account,
        user,
        user_token_account: ctx.accounts.user_token_account.key(),
    });

    Ok(())
}
