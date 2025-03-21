// wrapped-m/instructions/admin/add_earner.rs

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::ANCHOR_DISCRIMINATOR_SIZE,
    errors::wMError,
    state::{
        Global, GLOBAL_SEED,
        Earner, EARNER_SEED,
    },
    utils::token::has_immutable_owner,
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct AddEarner<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
        has_one = admin @ wMError::NotAuthorized,
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        token::mint = global_account.ext_mint,
        token::authority = user,
        constraint = has_immutable_owner(&user_token_account) @ wMError::ImmutableOwner,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = admin,
        space = ANCHOR_DISCRIMINATOR_SIZE + Earner::INIT_SPACE,
        seeds = [EARNER_SEED, user_token_account.key().as_ref()],
        bump
    )]
    pub earner_account: Account<'info, Earner>,

    pub system_program: Program<'info, System>,

    #[account(
        token::mint = global_account.ext_mint,
        constraint = has_immutable_owner(&recipient_token_account) @ wMError::ImmutableOwner,
    )]
    pub recipient_token_account: Option<InterfaceAccount<'info, TokenAccount>>,
}

pub fn handler(ctx: Context<AddEarner>, user: Pubkey) -> Result<()> {
    let recipient_token_account = if let Some(token_account) = &ctx.accounts.recipient_token_account {
        Some(token_account.key())
    } else {
        None
    };

    ctx.accounts.earner_account.set_inner(Earner {
        last_claim_index: ctx.accounts.global_account.index,
        last_claim_timestamp: Clock::get()?.unix_timestamp.try_into().unwrap(),
        bump: ctx.bumps.earner_account,
        user,
        user_token_account: ctx.accounts.user_token_account.key(),
        recipient_token_account,
    });

    Ok(())
}