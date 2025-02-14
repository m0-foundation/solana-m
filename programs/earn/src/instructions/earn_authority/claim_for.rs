// earn_authority

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

// local dependencies
use crate::{
    errors::EarnError,
    constants::{
        MINT,
        ONE_HUNDRED_PERCENT,
    },
    state::{
        Global, GLOBAL_SEED,
        Earner, EARNER_SEED,
        EarnManager, EARN_MANAGER_SEED,
    },
    utils::token::mint_tokens
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

    #[account(mut, address = MINT)]
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

    /// CHECK: This account is checked in the CPI to Token2022 program
    pub mint_authority: UncheckedAccount<'info>,

    #[account(
        seeds = [EARN_MANAGER_SEED, earner.earn_manager.unwrap().as_ref()],
        bump
    )]
    pub earn_manager_account: Option<Account<'info, EarnManager>>,

    /// CHECK: The key of this account needs to equal the key
    /// stored as earn_manager_account.fee_token_account.
    /// We check this manually in the instruction handler
    /// since the earn_manager_account is Optional.
    #[account(token::mint = mint)]
    pub earn_manager_token_account: Option<InterfaceAccount<'info, TokenAccount>>,
}

pub fn handler(ctx: Context<ClaimFor>, snapshot_balance: u64) -> Result<()> {
    // Validate that the earner account is still approved to earn
    if !ctx.accounts.earner.is_earning {
        return err!(EarnError::NotEarning);
    }
    
    // Validate that the earner account has not already claimed this cycle
    // Earner index should never be > global index, but we check to be safe against an error with index propagation
    if ctx.accounts.earner.last_claim_index >= ctx.accounts.global.index {
        return err!(EarnError::AlreadyClaimed);
    }

    // Calculate the amount of tokens to send to the user
    // Cast to u128 for multiplication to avoid overflows
    let mut rewards: u64 = (snapshot_balance as u128)
        .checked_mul(ctx.accounts.global.index.into()).unwrap()
        .checked_div(ctx.accounts.earner.last_claim_index.into()).unwrap()
        .try_into().unwrap();
    rewards -= snapshot_balance; // can't underflow because global index > last claim index

    // Validate the rewards do not cause the distributed amount to exceed the max yield
    let distributed = ctx.accounts.global.distributed.checked_add(rewards).unwrap();
    if distributed > ctx.accounts.global.max_yield {
        return err!(EarnError::ExceedsMaxYield);
    }

    // Update the total distributed
    ctx.accounts.global.distributed = distributed;

    // Set the earner's last claim index to the global index
    ctx.accounts.earner.last_claim_index = ctx.accounts.global.index;

    // Setup the signer seeds for the mint CPI(s)
    let earn_global_seeds: &[&[&[u8]]] = &[&[
        GLOBAL_SEED, &[ctx.bumps.global]
    ]];

    // If the earner has an earn manager, validate the earn manager account and earn manager's token account
    // Then, calculate any fee for the earn manager, mint those tokens, and reduce the rewards by the amount sent
    rewards -= if let Some(_) = ctx.accounts.earner.earn_manager {
        let earn_manager_account = match &ctx.accounts.earn_manager_account {
            Some(earn_manager_account) => earn_manager_account,
            None => return err!(EarnError::RequiredAccountMissing)
        };

        // TODO should we return an error is the earn manager is not active?
        // This would happen if an earn manager is removed, but the orphaned earner has not been cleaned up yet

        let earn_manager_token_account = match &ctx.accounts.earn_manager_token_account {
            Some(earn_manager_token_account) => if earn_manager_token_account.key() != earn_manager_account.fee_token_account {
                return err!(EarnError::InvalidAccount);
            } else {
                earn_manager_token_account
            },
            None => return err!(EarnError::RequiredAccountMissing)
        };

        // If we reach this point, then the correct accounts have been provided and we can calculate the fee split
        if earn_manager_account.fee_bps > 0 {
            // Fees are rounded down in favor of the user
            let fee = (rewards * earn_manager_account.fee_bps) / ONE_HUNDRED_PERCENT;

            if fee > 0 {
                mint_tokens(
                    &earn_manager_token_account, // to
                    &fee, // amount
                    &ctx.accounts.mint, // mint
                    &ctx.accounts.mint_authority, // mint authority (in this case it should be the multisig account on the token program)
                    earn_global_seeds, // signer seeds
                    &ctx.accounts.token_program // token program
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
        &ctx.accounts.user_token_account, // to
        &rewards, // amount
        &ctx.accounts.mint, // mint
        &ctx.accounts.mint_authority, // mint authority (in this case it should be the multisig account on the token program)
        earn_global_seeds, // signer seeds
        &ctx.accounts.token_program // token program
    )
}

