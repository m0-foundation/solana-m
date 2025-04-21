// ext_earn/instructions/add_earn_manager.rs

use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::{ANCHOR_DISCRIMINATOR_SIZE, ONE_HUNDRED_PERCENT},
    errors::ExtError,
    state::{EarnManager, ExtGlobal, EARN_MANAGER_SEED, EXT_GLOBAL_SEED},
};

#[derive(Accounts)]
#[instruction(earn_manager: Pubkey)]
pub struct AddEarnManager<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [EXT_GLOBAL_SEED],
        bump = global_account.bump,
        has_one = admin @ ExtError::NotAuthorized,
    )]
    pub global_account: Account<'info, ExtGlobal>,

    #[account(
        init_if_needed,
        payer = admin,
        space = ANCHOR_DISCRIMINATOR_SIZE + EarnManager::INIT_SPACE,
        seeds = [EARN_MANAGER_SEED, earn_manager.as_ref()],
        bump
    )]
    pub earn_manager_account: Account<'info, EarnManager>,

    #[account(token::mint = global_account.ext_mint)]
    pub fee_token_account: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddEarnManager>, earn_manager: Pubkey, fee_bps: u64) -> Result<()> {
    if fee_bps > ONE_HUNDRED_PERCENT {
        return err!(ExtError::InvalidParam);
    }

    ctx.accounts.earn_manager_account.set_inner(EarnManager {
        earn_manager,
        is_active: true,
        fee_bps,
        fee_token_account: ctx.accounts.fee_token_account.key(),
        bump: ctx.bumps.earn_manager_account,
    });

    Ok(())
}
