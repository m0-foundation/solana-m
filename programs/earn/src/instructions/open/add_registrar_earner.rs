// earn/instructins/open/add_earner.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};

// local dependencies
use common::{
    constants::{ANCHOR_DISCRIMINATOR_SIZE, MINT},
};
use crate::{
    constants::REGISTRAR,
    errors::EarnError,
    state::{
        Global, GLOBAL_SEED,
        Earner, EARNER_SEED,
    },
};
use registrar::{
    constants::EARNER_LIST,
    views::is_in_list,
};


#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct AddRegistrarEarner<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(address = MINT)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        token::mint = mint,
        token::authority = user
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [GLOBAL_SEED],
        bump
    )]
    pub global_account: Account<'info, Global>,

    #[account(
        init,
        payer = signer,
        space = Earner::INIT_SPACE + ANCHOR_DISCRIMINATOR_SIZE,
        seeds = [EARNER_SEED, token_account.key().as_ref()],
        bump
    )]
    pub earner_account: Account<'info, Earner>,

    /// CHECK: we validate this account within the instruction
    /// since we expect it to be an externally owned PDA
    pub registrar_flag: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddRegistrarEarner>, user: Pubkey, flag_bump: u8) -> Result<()> {
    // Check that the user is on the earner list
    if !is_in_list(
        &REGISTRAR, 
        &ctx.accounts.registrar_flag.to_account_info(),
        flag_bump, 
        &EARNER_LIST, 
        &user
    )? {
        return err!(EarnError::NotAuthorized);
    }

    // Initialize the user earning account
    ctx.accounts.earner_account.is_earning = true;

    // Set the earner's last claim index to the global index
    ctx.accounts.earner_account.last_claim_index = ctx.accounts.global_account.index;

    // We don't set the earn_manager since this user is not managed by an earn manager

    // Log the success of the operation
    msg!(
        "User {}'s token account {} was added as an earner with earning account {}.", 
        user,
        ctx.accounts.token_account.key(), 
        ctx.accounts.earner_account.key()
    );

    Ok(())
}