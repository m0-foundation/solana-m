// registrar/instructions/admin/remove_from_list.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    constants::ADMIN,
    state::Flag,
    utils::to_base58
};

/// RemoveFromList context
#[derive(Accounts)]
#[instruction(list: [u8; 32], address: Pubkey)]
pub struct RemoveFromList<'info> {
    #[account(
        mut,
        address = ADMIN
    )]
    pub signer: Signer<'info>,

    #[account(
        mut,
        close = signer,
        seeds = [b"LIST", list.as_slice(), address.as_ref()],
        bump
    )]
    pub flag: Account<'info, Flag>,
}

/// RemoveFromList instruction handler
pub fn handler(_ctx: Context<RemoveFromList>, list: [u8; 32], address: Pubkey) -> Result<()> {
    // The account is closed by this instruction so we do not need to update the value of it.
    msg!("Removed {} from the list with key {},", address, to_base58(&list));

    Ok(())
}