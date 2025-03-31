// ext_earn_authority

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, Token2022};

// local dependencies
use crate::{
    constants::ONE_HUNDRED_PERCENT,
    errors::ExtError,
    state::{
        ExtGlobal, EXT_GLOBAL_SEED,
        EarnManager, EARN_MANAGER_SEED,
        Earner, EARNER_SEED,
        M_VAULT_SEED,
        MINT_AUTHORITY_SEED,
    },
    utils::token::mint_tokens,
};

#[derive(Accounts)]
pub struct ClaimFor<'info> {
    pub earn_authority: Signer<'info>,

    #[account(
        mut,
        has_one = ext_mint @ ExtError::InvalidAccount,
        has_one = earn_authority @ ExtError::NotAuthorized,
        seeds = [EXT_GLOBAL_SEED],
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, ExtGlobal>,

    #[account(mut)]
    pub ext_mint: InterfaceAccount<'info, Mint>,
    
    /// CHECK: This account is validated by the seed, it stores no data
    #[account(
        seeds = [MINT_AUTHORITY_SEED],
        bump = global_account.ext_mint_authority_bump,
    )]
    pub ext_mint_authority: AccountInfo<'info>,

    /// CHECK: This account is validated by the seed, it stores no data
    #[account(
        seeds = [M_VAULT_SEED],
        bump = global_account.m_vault_bump,
    )]
    pub m_vault_account: AccountInfo<'info>,

    #[account(
        associated_token::mint = global_account.m_mint,
        associated_token::authority = m_vault_account,
        associated_token::token_program = token_2022,
    )]
    pub vault_m_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        address = match earner_account.recipient_token_account {
            Some(token_account) => token_account,
            None => earner_account.user_token_account,
        } @ ExtError::InvalidAccount,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [EARNER_SEED, earner_account.user_token_account.as_ref()],
        bump = earner_account.bump,
    )]
    pub earner_account: Account<'info, Earner>,

    #[account(
        seeds = [EARN_MANAGER_SEED, earner_account.earn_manager.as_ref()],
        bump = earn_manager_account.bump,
    )]
    pub earn_manager_account: Account<'info, EarnManager>,

    #[account(mut, address = earn_manager_account.fee_token_account @ ExtError::InvalidAccount)]
    pub earn_manager_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_2022: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<ClaimFor>, snapshot_balance: u64) -> Result<()> {
    // Validate that the earner account has not already claimed this cycle
    // Earner index should never be > global index, but we check to be safe against an error with index propagation
    if ctx.accounts.earner_account.last_claim_index >= ctx.accounts.global_account.index {
        return err!(ExtError::AlreadyClaimed);
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

    // Validate that the newly minted rewards will not make the extension undercollateralized
    let ext_supply = ctx.accounts.ext_mint.supply;
    let ext_collateral = ctx.accounts.vault_m_token_account.amount;

    if ext_supply + rewards > ext_collateral {
        return err!(ExtError::InsufficientCollateral);
    }

    // Set the earner's last claim index to the global index and update the last claim timestamp
    ctx.accounts.earner_account.last_claim_index = ctx.accounts.global_account.index;
    ctx.accounts.earner_account.last_claim_timestamp = ctx.accounts.global_account.timestamp;

    // Setup the signer seeds for the mint CPI(s)
    let mint_authority_seeds: &[&[&[u8]]] = &[&[
        MINT_AUTHORITY_SEED, &[ctx.accounts.global_account.ext_mint_authority_bump],
    ]];
    
    // Calculate the earn manager fee if applicable and subtract from the earner's rewards
    // If the earn manager is not active, then no fee is taken
    let fee = if ctx.accounts.earn_manager_account.fee_bps > 0 && ctx.accounts.earn_manager_account.is_active {
        // Fees are rounded down in favor of the user
        let fee = (rewards * ctx.accounts.earn_manager_account.fee_bps) / ONE_HUNDRED_PERCENT;

        if fee > 0 {
            mint_tokens(
                &ctx.accounts.earn_manager_token_account,  // to
                fee,                                       // amount
                &ctx.accounts.ext_mint,                    // mint
                &ctx.accounts.ext_mint_authority,          // mint authority
                mint_authority_seeds,                      // mint authority seeds
                &ctx.accounts.token_2022,                  // token program
            )?;

            // Return the fee to reduce the rewards by
            fee
        } else {
            0u64
        }
    } else {
        0u64
    };

    rewards -= fee;

    // Mint the tokens to the user's token aaccount
    mint_tokens(
        &ctx.accounts.user_token_account, // to
        rewards,                          // amount
        &ctx.accounts.ext_mint,           // mint
        &ctx.accounts.ext_mint_authority, // authority
        mint_authority_seeds,             // authority seeds
        &ctx.accounts.token_2022,         // token program
    )?;

    emit!(RewardsClaim {
        token_account: ctx.accounts.earner_account.user_token_account,
        recipient_token_account: ctx.accounts.user_token_account.key(),
        amount: rewards,
        fee,
        ts: ctx.accounts.earner_account.last_claim_timestamp,
        index: ctx.accounts.earner_account.last_claim_index,
    });

    Ok(())
}

#[event]
pub struct RewardsClaim {
    pub token_account: Pubkey,
    pub amount: u64,
    pub ts: u64,
    pub index: u64,
    pub fee: u64,
    pub recipient_token_account: Pubkey,
}