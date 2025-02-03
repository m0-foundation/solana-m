// registrar/instructions/admin/add_to_list.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    constants::{ADMIN, ANCHOR_DISCRIMINATOR_SIZE},
    errors::RegistrarError,
    state::Flag,
    utils::to_base58
};

/// AddToList context
#[derive(Accounts)]
#[instruction(list: [u8; 32], address: Pubkey)]
pub struct AddToList<'info> {
    #[account(
        mut,
        address = ADMIN
    )]
    pub signer: Signer<'info>,

    #[account(
        init_if_needed,
        payer = signer,
        space = Flag::INIT_SPACE + ANCHOR_DISCRIMINATOR_SIZE,
        seeds = [b"LIST", list.as_slice(), address.as_ref()],
        bump
    )]
    pub flag: Account<'info, Flag>,

    pub system_program: Program<'info, System>,
}

/// AddToList instruction handler
pub fn handler(ctx: Context<AddToList>, list: [u8; 32], address: Pubkey) -> Result<()> {
    // Revert if the account flag is already true
    // We are using init_if_needed to be able to re-add the address to the list if removed
    // However, we don't want the address to be added twice and emit another message
    if ctx.accounts.flag.value {
        return err!(RegistrarError::AlreadyInList);
    }

    // Set the flag on the account to true to signify the address is in the list
    ctx.accounts.flag.value = true;

    msg!("Added {} to the list with key {}", address, to_base58(&list));

    Ok(())
}