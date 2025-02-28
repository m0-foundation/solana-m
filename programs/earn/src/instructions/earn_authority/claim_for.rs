// earn_authority

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

// local dependencies
use crate::{
    constants::ONE_HUNDRED_PERCENT,
    errors::EarnError,
    state::{
        EarnManager, Earner, Global, EARNER_SEED, EARN_MANAGER_SEED, GLOBAL_SEED,
        TOKEN_AUTHORITY_SEED,
    },
    utils::token::mint_tokens,
};

#[derive(Accounts)]
pub struct ClaimFor<'info> {
    pub earn_authority: Signer<'info>,

    #[account(
        mut,
        has_one = mint,
        has_one = earn_authority,
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, Global>,

    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [TOKEN_AUTHORITY_SEED],
        bump
    )]
    pub token_authority_account: AccountInfo<'info>,

    #[account(mut)]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        constraint = earner_account.earn_manager.is_none() || earn_manager_account.is_some() @ EarnError::RequiredAccountMissing,
        has_one = user_token_account,
        seeds = [EARNER_SEED, user_token_account.key().as_ref()],
        bump = earner_account.bump,
    )]
    pub earner_account: Account<'info, Earner>,

    pub token_program: Interface<'info, TokenInterface>,

    /// CHECK: This account is checked in the CPI to Token2022 program
    pub mint_multisig: UncheckedAccount<'info>,

    #[account(
        constraint = earn_manager_token_account.is_some() @ EarnError::RequiredAccountMissing,
        seeds = [EARN_MANAGER_SEED, earner_account.earn_manager.unwrap().as_ref()],
        bump = earn_manager_account.bump,
    )]
    pub earn_manager_account: Option<Account<'info, EarnManager>>,

    #[account(mut, address = earn_manager_account.clone().unwrap().fee_token_account)]
    pub earn_manager_token_account: Option<InterfaceAccount<'info, TokenAccount>>,
}

pub fn handler(ctx: Context<ClaimFor>, snapshot_balance: u64) -> Result<()> {
    // Validate that the earner account is still approved to earn
    if !ctx.accounts.earner_account.is_earning {
        return err!(EarnError::NotEarning);
    }

    // Validate that the earner account has not already claimed this cycle
    // Earner index should never be > global index, but we check to be safe against an error with index propagation
    if ctx.accounts.earner_account.last_claim_index >= ctx.accounts.global_account.index {
        return err!(EarnError::AlreadyClaimed);
    }

    // Calculate the amount of tokens to send to the user
    // Cast to u128 for multiplication to avoid overflows
    let mut rewards: u64 = (snapshot_balance as u128)
        .checked_mul(ctx.accounts.global_account.index.into())
        .unwrap()
        .checked_div(ctx.accounts.earner_account.last_claim_index.into())
        .unwrap()
        .try_into()
        .unwrap();

    rewards -= snapshot_balance; // can't underflow because global index > last claim index

    // Validate the rewards do not cause the distributed amount to exceed the max yield
    let distributed = ctx
        .accounts
        .global_account
        .distributed
        .checked_add(rewards)
        .unwrap();

    if distributed > ctx.accounts.global_account.max_yield {
        return err!(EarnError::ExceedsMaxYield);
    }

    // Update the total distributed
    ctx.accounts.global_account.distributed = distributed;

    // Set the earner's last claim index to the global index and update the last claim timestamp
    ctx.accounts.earner_account.last_claim_index = ctx.accounts.global_account.index;
    ctx.accounts.earner_account.last_claim_timestamp =
        Clock::get()?.unix_timestamp.try_into().unwrap();

    // Setup the signer seeds for the mint CPI(s)
    let token_authority_seeds: &[&[&[u8]]] =
        &[&[TOKEN_AUTHORITY_SEED, &[ctx.bumps.token_authority_account]]];

    // If the earner has an earn manager, validate the earn manager account and earn manager's token account
    // Then, calculate any fee for the earn manager, mint those tokens, and reduce the rewards by the amount sent
    rewards -= if let Some(_) = ctx.accounts.earner_account.earn_manager {
        let earn_manager_account = &ctx.accounts.earn_manager_account.clone().unwrap();

        // If we reach this point, then the correct accounts have been provided and we can calculate the fee split
        // If the earn manager is not active, then no fee is taken
        if earn_manager_account.fee_bps > 0 && earn_manager_account.is_active {
            // Fees are rounded down in favor of the user
            let fee = (rewards * earn_manager_account.fee_bps) / ONE_HUNDRED_PERCENT;

            if fee > 0 {
                mint_tokens(
                    &ctx.accounts.earn_manager_token_account.clone().unwrap(), // to
                    &fee,                                                      // amount
                    &ctx.accounts.mint,                                        // mint
                    &ctx.accounts.mint_multisig,                               // mint authority
                    &ctx.accounts.token_authority_account,                     // signer
                    token_authority_seeds,                                     // signer seeds
                    &ctx.accounts.token_program,                               // token program
                )?;

                // Return the fee to reduce the rewards by
                fee
            } else {
                0u64
            }
        } else {
            0u64
        }
    } else {
        0u64
    };

    // Mint the tokens to the user's token aaccount
    // The result of the CPI is the result of the handler
    mint_tokens(
        &ctx.accounts.user_token_account,      // to
        &rewards,                              // amount
        &ctx.accounts.mint,                    // mint
        &ctx.accounts.mint_multisig,           // multisig mint authority
        &ctx.accounts.token_authority_account, // signer
        token_authority_seeds,                 // signer seeds
        &ctx.accounts.token_program,           // token program
    )?;

    msg!(
        "Claimed for: {} | Index: {} | Timestamp: {}",
        ctx.accounts.user_token_account.key(),
        ctx.accounts.earner_account.last_claim_index,
        ctx.accounts.earner_account.last_claim_timestamp
    );

    Ok(())
}
