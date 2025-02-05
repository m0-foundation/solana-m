// earn_authority

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

// local dependencies
use common::constants::{MINT, ONE};
use crate::{
    errors::EarnError,
    constants::{MINT_MASTER, REWARDS_SCALE},
    state::{
        Global, GLOBAL_SEED,
        Earner, EARNER_SEED,
        EarnManager, EARN_MANAGER_SEED,
    },
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

    #[account(address = MINT_MASTER)]
    pub mint_master_program: Program<'info, MintMasterProgram>,

    /// CHECK: This account is checked in the CPI to MintMaster
    pub mint_master_account: UncheckedAccount<'info>,

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

// TODO handle sending yield split to the user's earn_manager
// Should there be a separate instruction that is for earner's with a manager?
// This one could just be for registrar approved earners (i.e. no manager)
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
    // TODO should we calculate the rewards per token locally for each user
    // this would allow us to skip certain users when the amount of rewards
    // is below some dust threshold, but also make it so they do not lose
    // rewards in the long-run. There may be other implications of allowing
    // rewards to persist through multiple claim cycles though.
    let rewards_per_token: u128 = ctx.accounts.global.rewards_per_token;
    let balance: u128 = snapshot_balance.into();

    let mut rewards: u64 = balance
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

    // Setup the signer seeds for the mint CPI(s)
    let earn_global_seeds: &[&[&[u8]]] = &[&[
        GLOBAL_SEED, &[ctx.bumps.global]
    ]];

    // If the earner has an earn manager, validate the earn manager account and earn manager's token account
    // Then, calculate any fee for the earn manager, mint those tokens, and reduce the rewards by the amount sent
    rewards -= if let Some(earn_manager) = ctx.accounts.earner.earn_manager {
        // TODO how should this work if the earn manager is removed?
        let earn_manager_account = match &ctx.accounts.earn_manager_account {
            Some(earn_manager_account) => earn_manager_account,
            None => return err!(EarnError::RequiredAccountMissing)
        };

        let mut earn_manager_token_account = match &ctx.accounts.earn_manager_token_account {
            Some(earn_manager_token_account) => if earn_manager_token_account.key() != earn_manager_account.fee_token_account {
                return err!(EarnError::InvalidAccount);
            } else {
                earn_manager_token_account
            },
            None => return err!(EarnError::RequiredAccountMissing)
        };

        // If we reach this point, then the correct accounts have been provided and we can calculate the fee split
        if earn_manager_account.fee_percent > 0 {
            // Fees are rounded down in favor of the user
            let fee = (rewards * earn_manager_account.fee_percent) / ONE;

            // TODO set some dust threshold?
            if fee > 0 {
                let cpi_context = CpiContext::new_with_signer(
                    ctx.accounts.mint_master_program.to_account_info(),
                    MintM {
                        signer: ctx.accounts.global.to_account_info(),
                        mint_master: ctx.accounts.mint_master_account.to_account_info(),
                        mint: ctx.accounts.mint.to_account_info(),
                        to_token_account: earn_manager_token_account.to_account_info(),
                        token_program: ctx.accounts.token_program.to_account_info(),
                    },
                    earn_global_seeds,
                );
                mint_m(cpi_context, fee)?;
    
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

    // Mint the tokens to the user's token aaccount via the MintMaster
    // The result of the CPI is the result of the handler
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

