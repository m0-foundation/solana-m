// registrar/instructions/admin/delete_key.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    constants::ADMIN,
    state::Register,
    utils::to_base58
};

/// DeleteKey context
#[derive(Accounts)]
#[instruction(key: [u8; 32])]
pub struct DeleteKey<'info> {
    #[account(
        mut,
        address = ADMIN
    )]
    pub signer: Signer<'info>,

    #[account(
        mut,
        close = signer, // TODO where should the refunded rent go?
        seeds = [b"VALUE", key.as_slice()],
        bump
    )]
    pub register: Account<'info, Register>,

    pub system_program: Program<'info, System>
}

/// SetKey instruction handler
pub fn handler(ctx: Context<DeleteKey>, key: [u8; 32]) -> Result<()> {
    msg!("Deleted the register for key {}", to_base58(&key));

    Ok(())
}