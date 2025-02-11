// earn/instructions/earn_manager/add_earner.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

// local dependencies
use common::constants::{ANCHOR_DISCRIMINATOR_SIZE, MINT};
use crate::{
    constants::REGISTRAR,
    errors::EarnError,
    state::{
        Global, GLOBAL_SEED,
        Earner, EARNER_SEED,
        EarnManager, EARN_MANAGER_SEED,
    },
};
use registrar::{
    constants::EARNER_LIST,
    errors::RegistrarError,
    views::is_in_list,
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]   
pub struct AddEarner<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [EARN_MANAGER_SEED, signer.key().as_ref()],
        bump
    )]
    pub earn_manager_account: Account<'info, EarnManager>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        token::mint = MINT,
        token::authority = user,
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

    /// CHECK: this account must be the calculated PDA
    /// for the user on the earner list in the registrar program
    /// It is checked manually within the instruction
    pub user_earner_list_flag: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}


pub fn handler(ctx: Context<AddEarner>, user: Pubkey, user_flag_bump: u8) -> Result<()> {
    // Check that the user is not on the earner list
    // Governance-approved earners can create their own accounts
    // and do not need to go through an earn manager
    match is_in_list(
        &REGISTRAR, 
        &ctx.accounts.user_earner_list_flag.to_account_info(),
        user_flag_bump,
        &EARNER_LIST, 
        &user
    ) { 
        Ok(is_earner) => if is_earner {
            return err!(EarnError::AlreadyEarns);
        },
        Err(error) => match error {
            Error::AnchorError(registrar_error) => if registrar_error.error_name == "NotInitialized" {
                // It's okay if the account hasn't been initialized, that means the user is not in the list
            } else {
                return err!(RegistrarError::InvalidPDA);
            },
            Error::ProgramError(_) => return err!(RegistrarError::InvalidPDA), 
            
        }
    }

    // We know the earn manager is approved because an EarnManager account exists for them
    // TODO think about if we want to add a flag there for disabling an earn manager
    // or if the EarnManager account should be deleted if they are no longer approved
    // on the registry.
    // This affects user earning accounts too which have the earn manager pubkey stored in them
    // and which is used for condition logic in the claim function.

    // We know the user doesn't already have an account with this token account because
    // the initialization of the user earning account succeeded if we've reached this point
    // so we don't need to check this.
    // Therefore, we initialize the data in the account.
    ctx.accounts.earner_account.is_earning = true;
    ctx.accounts.earner_account.earn_manager = Some(ctx.accounts.signer.key().clone());

    // Set the last claim index on the user's earner account
    ctx.accounts.earner_account.last_claim_index = ctx.accounts.global_account.index;

    Ok(())
}