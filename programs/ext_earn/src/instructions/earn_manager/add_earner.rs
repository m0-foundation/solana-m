// ext_earn/instructions/earn_manager/add_earner.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

// local dependencies
use crate::{
    constants::ANCHOR_DISCRIMINATOR_SIZE,
    errors::ExtError,
    state::{EarnManager, Earner, ExtGlobal, EARNER_SEED, EARN_MANAGER_SEED, EXT_GLOBAL_SEED},
    utils::token::has_immutable_owner,
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct AddEarner<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        constraint = earn_manager_account.is_active @ ExtError::NotActive,
        seeds = [EARN_MANAGER_SEED, signer.key().as_ref()],
        bump = earn_manager_account.bump
    )]
    pub earn_manager_account: Account<'info, EarnManager>,

    #[account(
        seeds = [EXT_GLOBAL_SEED],
        bump = global_account.bump
    )]
    pub global_account: Account<'info, ExtGlobal>,

    #[account(
        token::mint = global_account.ext_mint,
        token::authority = user,
        constraint = has_immutable_owner(&user_token_account) @ ExtError::MutableOwner,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = signer,
        space = ANCHOR_DISCRIMINATOR_SIZE + Earner::INIT_SPACE,
        seeds = [EARNER_SEED, user_token_account.key().as_ref()],
        bump
    )]
    pub earner_account: Account<'info, Earner>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddEarner>, user: Pubkey) -> Result<()> {
    ctx.accounts.earner_account.set_inner(Earner {
        earn_manager: ctx.accounts.signer.key(),
        recipient_token_account: None,
        last_claim_index: ctx.accounts.global_account.index,
        last_claim_timestamp: Clock::get()?.unix_timestamp.try_into().unwrap(),
        bump: ctx.bumps.earner_account,
        user,
        user_token_account: ctx.accounts.user_token_account.key(),
    });

    Ok(())
}
