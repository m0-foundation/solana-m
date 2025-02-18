// earn/instructions/earn_manager/add_earner.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

// local dependencies
use crate::{
    constants::{ANCHOR_DISCRIMINATOR_SIZE, BIT, MINT},
    errors::EarnError,
    state::{
        Global, GLOBAL_SEED,
        Earner, EARNER_SEED,
        EarnManager, EARN_MANAGER_SEED,
    },
    utils::merkle_proof::verify_not_in_tree,
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]   
pub struct AddEarner<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [EARN_MANAGER_SEED, signer.key().as_ref()],
        bump
    )]
    pub earn_manager_account: Account<'info, EarnManager>,

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
    proof: Vec<[u8; 32]>,
    sibling: [u8; 32]
) -> Result<()> {
    // Verify the user is not already an earner by proving a different value exists at their position
    let user_leaf = solana_program::keccak::hashv(&[&[BIT], &user.to_bytes()]).to_bytes();
    if !verify_not_in_tree(
        proof,
        ctx.accounts.global_account.earner_merkle_root,
        user_leaf,
        sibling
    ) {
        return err!(EarnError::AlreadyEarns);
    }

    // Only active earn managers can add earners
    if !ctx.accounts.earn_manager_account.is_active {
        return err!(EarnError::NotAuthorized);
    }

    // Initialize the user earning account
    ctx.accounts.earner_account.is_earning = true;
    ctx.accounts.earner_account.earn_manager = Some(ctx.accounts.signer.key().clone());

    // Set the last claim index on the user's earner account
    ctx.accounts.earner_account.last_claim_index = ctx.accounts.global_account.index;

    Ok(())
}