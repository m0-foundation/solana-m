// earn/instructions/earn_manager/configure.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

// local dependencies
use common::constants::{ANCHOR_DISCRIMINATOR_SIZE, ONE, MINT};
use crate::{
    constants::REGISTRAR,
    errors::EarnError,
    state::{EarnManager, EARN_MANAGER_SEED},
};
use registrar::{
    constants::EARN_MANAGER_LIST,
    views::is_in_list,
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
        init,
        payer = signer,
        space = EarnManager::INIT_SPACE + ANCHOR_DISCRIMINATOR_SIZE,
        seeds = [EARN_MANAGER_SEED, signer.key().as_ref()],
        bump
    )]
    pub earn_manager_account: Account<'info, EarnManager>,

    #[account(
        token::mint = MINT,
        token::authority = signer, // TODO should this be configurable to another address or require it be the earn_manager?
    )]
    pub earn_manager_token_account: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ConfigureEarnManager>, fee_percent: u64, flag_bump: u8) -> Result<()> {
    // Check that the signer is on the earn manager list
    if !is_in_list(
        &REGISTRAR, 
        &ctx.accounts.registrar_flag.to_account_info(),
        flag_bump, 
        &EARN_MANAGER_LIST, 
        &ctx.accounts.signer.key()
    )? {
        // We do not catch return errors since we want this instruction to fail in that case
        // Additionally, if the check succeeds, but returns false, the signer is not authorized.
        return err!(EarnError::NotAuthorized);
    }

    // Check that the fee is less than 100%
    if fee_percent > ONE {
        return err!(EarnError::InvalidParam);
    }

    // Set the earn manager's fee and token account to receive fees in
    ctx.accounts.earn_manager_account.fee_percent = fee_percent;
    ctx.accounts.earn_manager_account.fee_token_account = ctx.accounts.earn_manager_token_account.key();

    Ok(())
}