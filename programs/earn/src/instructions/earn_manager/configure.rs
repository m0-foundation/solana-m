// earn/instructions/earn_manager/configure.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

// local dependencies
use common::{
    constants::{ANCHOR_DISCRIMINATOR_SIZE, ONE, MINT},
    utils::verify_in_tree,
};
use crate::{
    errors::EarnError,
    state::{
        Global, GLOBAL_SEED,
        EarnManager, EARN_MANAGER_SEED,
    },
};

#[derive(Accounts)]
pub struct ConfigureEarnManager<'info> {
    /// CHECK: this account must be an approved earn manager, which is denoted in the registry
    /// We check this within the instruction because we have to deserialize and validate the registry flag first
    #[account(mut)]
    pub signer: Signer<'info>,

    /// CHECK: we expect this to be a PDA owned by the REGISTRAR program
    /// Since it is an externally owned PDA, we have to validate manually
    /// in the instruction handler. We do this using the imported `is_in_list` function
    pub registrar_flag: UncheckedAccount<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump
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

    #[account(
        token::mint = MINT,
        token::authority = signer, // TODO should this be configurable to another address or require it be the earn_manager?
    )]
    pub fee_token_account: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ConfigureEarnManager>, 
    fee_percent: u64,
    proof: Vec<[u8; 32]>
) -> Result<()> {
    // Verify the signer is an approved earn manager
    let leaf = solana_program::hash::hashv(&[&[1u8], &ctx.accounts.signer.key().to_bytes()]).to_bytes();
    if !verify_in_tree(
        proof,
        ctx.accounts.global_account.earn_manager_merkle_root,
        leaf
    ) {
        return err!(EarnError::NotAuthorized);
    }

    // Validate the fee percent is not greater than 100%
    if fee_percent > ONE {
        return err!(EarnError::InvalidParam);
    }

    // Configure the earn manager account
    let earn_manager = &mut ctx.accounts.earn_manager_account;
    earn_manager.fee_percent = fee_percent;
    earn_manager.fee_token_account = ctx.accounts.fee_token_account.key();

    Ok(())
}