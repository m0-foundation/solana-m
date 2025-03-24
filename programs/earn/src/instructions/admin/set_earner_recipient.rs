use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    errors::EarnError,
    state::{Earner, Global, EARNER_SEED, GLOBAL_SEED},
};

#[derive(Accounts)]
pub struct SetEarnerRecipient<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        has_one = admin @ EarnError::NotAuthorized,
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        mut,
        seeds = [EARNER_SEED, earner_account.user_token_account.as_ref()],
        bump = earner_account.bump
    )]
    pub earner_account: Account<'info, Earner>,

    #[account(token::mint = global_account.mint)]
    pub recipient_token_account: Option<InterfaceAccount<'info, TokenAccount>>,
}

pub fn handler(ctx: Context<SetEarnerRecipient>) -> Result<()> {
    ctx.accounts.earner_account.recipient_token_account =
        if let Some(token_account) = &ctx.accounts.recipient_token_account {
            Some(token_account.key())
        } else {
            None
        };

    Ok(())
}
