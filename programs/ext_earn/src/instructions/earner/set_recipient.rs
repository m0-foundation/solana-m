// ext_earn/instructions/earner/set_recipient.rs

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    errors::ExtError,
    state::{Earner, ExtGlobal, EARNER_SEED, EXT_GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct SetRecipient<'info> {
    #[account(
        constraint =
            signer.key() == earner_account.user ||
            signer.key() == earner_account.earn_manager
            @ ExtError::NotAuthorized,
    )]
    pub signer: Signer<'info>,

    #[account(
        seeds = [EXT_GLOBAL_SEED],
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, ExtGlobal>,

    #[account(
        mut,
        seeds = [EARNER_SEED, &earner_account.user_token_account.as_ref()],
        bump = earner_account.bump,
    )]
    pub earner_account: Account<'info, Earner>,

    #[account(token::mint = global_account.ext_mint)]
    pub recipient_token_account: Option<InterfaceAccount<'info, TokenAccount>>,
}

pub fn handler(ctx: Context<SetRecipient>) -> Result<()> {
    ctx.accounts.earner_account.recipient_token_account =
        if let Some(token_account) = &ctx.accounts.recipient_token_account {
            Some(token_account.key())
        } else {
            None
        };

    Ok(())
}
