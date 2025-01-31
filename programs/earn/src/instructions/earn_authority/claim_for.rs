// earn_authority

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

// local dependencies
use common::constants::MINT;
use crate::{
    errors::EarnError,
    constants::{MINT_MASTER, REWARDS_SCALE},
    state::{Global, GLOBAL_SEED, Earner, EARNER_SEED},
};
use mint_master::{
    cpi::{mint_m, accounts::MintM},
    program::MintMaster as MintMasterProgram,
};


#[derive(Accounts)]
pub struct ClaimFor<'info> {
    #[account(address = global.earn_authority)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        bump,
    )]
    pub global: Account<'info, Global>,

    #[account(address = MINT)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(token::mint = mint)]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [EARNER_SEED, user_token_account.key().as_ref()],
        bump
    )]
    pub earner: Account<'info, Earner>,

    pub token_program: Interface<'info, TokenInterface>,

    #[account(address = MINT_MASTER)]
    pub mint_master_program: Program<'info, MintMasterProgram>,

    /// CHECK: This account is checked in the CPI to MintMaster
    pub mint_master_account: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<ClaimFor>, snapshot_balance: u64) -> Result<()> {
    // Validate that the earner account has not already claimed this cycle
    // Earner index should never be > global index, but we check to be safe against an error with index propagation
    if ctx.accounts.earner.last_claim_index >= ctx.accounts.global.index {
        return err!(EarnError::AlreadyClaimed);
    }

    // Calculate the amount of tokens to send to the user
    let rewards_per_token: u128 = ctx.accounts.global.rewards_per_token;
    let balance: u128 = snapshot_balance.into();

    let rewards: u64 = balance
        .checked_mul(rewards_per_token).unwrap()
        .checked_div(REWARDS_SCALE).unwrap()
        .try_into().unwrap();

    // Validate the rewards do not cause the distributed amount to exceed the max yield
    let distributed = ctx.accounts.global.distributed.checked_add(rewards).unwrap();
    if distributed > ctx.accounts.global.max_yield {
        return err!(EarnError::ExceedsMaxYield);
    }

    // Update the total distributed
    ctx.accounts.global.distributed = distributed;

    // Set the earner's last claim index to the global index
    ctx.accounts.earner.last_claim_index = ctx.accounts.global.index;

    // Mint the tokens to the user's token aaccount via the MintMaster
    // The result of the CPI is the result of the handler
    let earn_global_seeds: &[&[&[u8]]] = &[&[
        GLOBAL_SEED, &[ctx.bumps.global]
    ]];

    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.mint_master_program.to_account_info(),
        MintM {
            signer: ctx.accounts.global.to_account_info(),
            mint_master: ctx.accounts.mint_master_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to_token_account: ctx.accounts.user_token_account.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        },
        earn_global_seeds,
    );
    mint_m(cpi_context, rewards)
}

