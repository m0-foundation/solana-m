// earn/instructions/earn_manager/remove_earner.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

// local dependencies
use common::constants::MINT;
use crate::state::{Earner, EARNER_SEED};

#[derive(Accounts)]
#[instruction(user: Pubkey)]   
pub struct RemoveEarner<'info> {
    #[account(address = earner_account.earn_manager)]
    pub signer: Signer<'info>,

    #[account(
        token::mint = MINT,
        token::authority = user,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        close = signer, // TODO should we close the account or just set the flag to false?
        seeds = [EARNER_SEED, user_token_account.key().as_ref()],
        bump
    )]
    pub earner_account: Account<'info, Earner>,
}


pub fn handler(ctx: Context<RemoveEarner>, user: Pubkey) -> Result<()> {
    // Set the is_earning status to false
    ctx.accounts.earner_account.is_earning = false;

    Ok(())
}