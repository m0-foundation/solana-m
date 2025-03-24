// ext_earn/instruction/transfer_earner.rs

use anchor_lang::prelude::*;

use crate::{
    errors::ExtError,
    state::{
        Earner, EARNER_SEED,
        EarnManager, EARN_MANAGER_SEED,
    }
};

#[derive(Accounts)]
#[instruction(to_earn_manager: Pubkey)]
pub struct TransferEarner<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [EARNER_SEED, earner_account.user.as_ref()],
        bump = earner_account.bump,
    )]
    pub earner_account: Account<'info, Earner>,

    #[account(
        constraint = from_earn_manager_account.is_active @ ExtError::NotActive,
        seeds = [EARN_MANAGER_SEED, signer.key().as_ref()],
        bump = from_earn_manager_account.bump,
    )]
    pub from_earn_manager_account: Account<'info, EarnManager>,

    #[account(
        constraint = to_earn_manager_account.is_active @ ExtError::NotActive,
        seeds = [EARN_MANAGER_SEED, to_earn_manager.as_ref()],
        bump = to_earn_manager_account.bump,
    )]
    pub to_earn_manager_account: Account<'info, EarnManager>,
}

pub fn handler(ctx: Context<TransferEarner>, to_earn_manager: Pubkey) -> Result<()> {
    ctx.accounts.earner_account.earn_manager = to_earn_manager;

    Ok(())
}

