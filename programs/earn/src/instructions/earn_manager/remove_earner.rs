// earn/instructions/earn_manager/remove_earner.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

// local dependencies
use crate::{
    constants::MINT,
    errors::EarnError,
    state::{Earner, EARNER_SEED}
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]   
pub struct RemoveEarner<'info> {
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
}


pub fn handler(ctx: Context<RemoveEarner>, _user: Pubkey) -> Result<()> {
    // Require that the earner has an earn manager
    // If not, it must be removed from the registrar
    // and a different instruction must be used
    if let Some(earn_manager) = ctx.accounts.earner_account.earn_manager {
        // Validate that the signer is the earn manager
        if ctx.accounts.signer.key() != earn_manager {
            return err!(EarnError::NotAuthorized);
        }
    } else {
        return err!(EarnError::NotAuthorized);
    }


    // Set the is_earning status to false
    ctx.accounts.earner_account.is_earning = false;

    Ok(())
}