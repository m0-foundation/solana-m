// earn_authority

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

// local dependencies
use crate::{
    errors::EarnError,
    state::{
        Earner, Global, EARNER_SEED, GLOBAL_SEED,
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
        has_one = earn_authority @ EarnError::NotAuthorized,
        seeds = [GLOBAL_SEED],
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        mut,
        owner = token_program.key(),
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: This account is checked in the CPI to Token2022 program
    #[account(
        seeds = [TOKEN_AUTHORITY_SEED],
        bump
    )]
    pub token_authority_account: AccountInfo<'info>,

    #[account(
        mut,
        address = earner_account.user_token_account
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [EARNER_SEED, earner_account.user_token_account.as_ref()],
        bump = earner_account.bump,
    )]
    pub earner_account: Account<'info, Earner>,

    pub token_program: Interface<'info, TokenInterface>,

    /// CHECK: This account is checked in the CPI to Token2022 program
    pub mint_multisig: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<ClaimFor>, snapshot_balance: u64) -> Result<()> {
    // Validate that the earner account has not already claimed this cycle
    // Earner index should never be > global index, but we check to be safe against an error with index propagation
    if ctx.accounts.earner_account.last_claim_index >= ctx.accounts.global_account.index {
        return err!(EarnError::AlreadyClaimed);
    }

    // Validate there is an active claim cycle
    if ctx.accounts.global_account.claim_complete {
        return err!(EarnError::NoActiveClaim);
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
    ctx.accounts.earner_account.last_claim_timestamp = ctx.accounts.global_account.timestamp;

    // Setup the signer seeds for the mint CPI(s)
    let token_authority_seeds: &[&[&[u8]]] =
        &[&[TOKEN_AUTHORITY_SEED, &[ctx.bumps.token_authority_account]]];

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

    // Check the current supply of M against the max supply in the global account
    // If it is greater, update the max supply
    // This check is also done when an index is propagated for a bridge
    // These are the only two actions that can mint M on Solana
    // Therefore, we always have an accurate max supply for calculating max yield
    if ctx.accounts.mint.supply > ctx.accounts.global_account.max_supply {
        ctx.accounts.global_account.max_supply = ctx.accounts.mint.supply;
    }

    let user_token_key = ctx.accounts.user_token_account.key();

    emit!(RewardsClaim {
        token_account: user_token_key,
        recipient_token_account: user_token_key,
        amount: rewards,
        ts: ctx.accounts.earner_account.last_claim_timestamp,
        index: ctx.accounts.global_account.index,
    });

    emit!(RewardsClaim {
        token_account: ctx.accounts.user_token_account.key(),
        recipient_token_account: match ctx.accounts.earner_account.recipient_token_account {
            Some(token_account) => token_account,
            _ => ctx.accounts.user_token_account.key(),
        },
        amount: rewards,
        ts: ctx.accounts.earner_account.last_claim_timestamp,
        index: ctx.accounts.global_account.index,
    });

    Ok(())
}

#[event]
pub struct RewardsClaim {
    pub token_account: Pubkey,
    pub recipient_token_account: Pubkey,
    pub amount: u64,
    pub ts: u64,
    pub index: u64,
}
