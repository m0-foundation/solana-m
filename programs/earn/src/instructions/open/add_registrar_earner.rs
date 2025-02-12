// earn/instructins/open/add_earner.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};

// local dependencies
use common::{
    constants::{ANCHOR_DISCRIMINATOR_SIZE, MINT},
    utils::verify_in_tree,
};
use crate::{
    errors::EarnError,
    state::{
        Global, GLOBAL_SEED,
        Earner, EARNER_SEED,
    },
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct AddRegistrarEarner<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(address = MINT)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        token::mint = mint,
        token::authority = user
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        init,
        payer = signer,
        space = Earner::INIT_SPACE + ANCHOR_DISCRIMINATOR_SIZE,
        seeds = [EARNER_SEED, token_account.key().as_ref()],
        bump
    )]
    pub earner_account: Account<'info, Earner>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<AddRegistrarEarner>, 
    user: Pubkey, 
    proof: Vec<[u8; 32]>
) -> Result<()> {
    // Create the leaf for verification - this should match how the leaf was created when generating the Merkle tree
    let leaf = solana_program::hash::hashv(&[&[1u8], &user.to_bytes()]).to_bytes();

    // Verify the user is in the approved earners list
    if !verify_in_tree(proof, ctx.accounts.global_account.earner_merkle_root, leaf) {
        return err!(EarnError::NotAuthorized);
    }

    // Initialize the user earning account
    ctx.accounts.earner_account.is_earning = true;

    // Set the earner's last claim index to the global index
    ctx.accounts.earner_account.last_claim_index = ctx.accounts.global_account.index;

    // Set the earner's earn manager to None
    ctx.accounts.earner_account.earn_manager = None;

    // Log the success of the operation
    msg!(
        "User {}'s token account {} was added as an earner with earning account {}.", 
        user,
        ctx.accounts.token_account.key(), 
        ctx.accounts.earner_account.key()
    );

    Ok(())
}