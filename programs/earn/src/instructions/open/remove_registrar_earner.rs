// earn/instructions/open/remove_registrar_earner.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

// local dependencies
use common::constants::MINT;
use crate::{
    constants::REGISTRAR,
    errors::EarnError,
    state::{Earner, EARNER_SEED}
};
use registrar::{
    constants::EARNER_LIST,
    views::is_in_list,
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct RemoveRegistrarEarner<'info> {
    pub signer: Signer<'info>,

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

    /// CHECK: we validate this account within the instruction
    /// since we expect it to be an externally owned PDA
    pub registrar_flag: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<RemoveRegistrarEarner>, user: Pubkey, flag_bump: u8) -> Result<()> {
    // Check if the user is still on the earner's list on the registrar
    // If so or if the check fails, return an error
    if is_in_list(
        &REGISTRAR, 
        &ctx.accounts.registrar_flag.to_account_info(),
        flag_bump, 
        &EARNER_LIST, 
        &user
    )? {
        return err!(EarnError::NotAuthorized);
    }

    // Check that the earner does not have an earn_manager, if so, return an error
    if let Some(_) = ctx.accounts.earner_account.earn_manager {
        return err!(EarnError::NotAuthorized);
    }

    // Set the is earning flag on the earner account to false, even though it's being closed
    ctx.accounts.earner_account.is_earning = false;

    Ok(())
}
