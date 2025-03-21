// wrapped-m/instructions/earner/set_yield_recipient.rs

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    errors::wMError,
    state::{
        Global, GLOBAL_SEED,
        Earner, EARNER_SEED,
    },
    utils::token::has_immutable_owner
};

#[derive(Accounts)]
pub struct SetYieldRecipient<'info> {
    #[account(
        constraint = signer.key() == earner_account.user || signer.key() 
            == global_account.admin @ wMError::NotAuthorized,
    )]
    pub signer: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        seeds = [EARNER_SEED, &earner_account.user_token_account.as_ref()],
        bump = earner_account.bump,
    )]
    pub earner_account: Account<'info, Earner>,

    #[account(
        token::mint = global_account.ext_mint,
        constraint = has_immutable_owner(&recipient_token_account) @ wMError::ImmutableOwner,
    )]
    pub recipient_token_account: Option<InterfaceAccount<'info, TokenAccount>>,
}

pub fn handler(ctx: Context<SetYieldRecipient>) -> Result<()> {
    ctx.accounts.earner_account.recipient_token_account =
        if let Some(token_account) = &ctx.accounts.recipient_token_account {
            Some(token_account.key())
        } else {
            None
        };

    Ok(())
}

