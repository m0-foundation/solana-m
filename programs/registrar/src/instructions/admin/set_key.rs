// registrar/instructions/admin/set_key.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    constants::{ADMIN, ANCHOR_DISCRIMINATOR_SIZE},
    state::Register,
    utils::to_base58
};

/// SetKey context
#[derive(Accounts)]
#[instruction(key: [u8; 32])]
pub struct SetKey<'info> {
    #[account(
        mut,
        address = ADMIN
    )]
    pub signer: Signer<'info>,

    #[account(
        init_if_needed,
        payer = signer,
        space = Register::INIT_SPACE + ANCHOR_DISCRIMINATOR_SIZE,
        seeds = [b"VALUE", key.as_slice()],
        bump
    )]
    pub register: Account<'info, Register>,

    pub system_program: Program<'info, System>
}

/// SetKey instruction handler
pub fn handler(ctx: Context<SetKey>, key: [u8; 32], value: [u8; 32]) -> Result<()> {
    // Set the value
    ctx.accounts.register.value = value;

    msg!("Set the register at key {} to {}", to_base58(&key), to_base58(&value));

    Ok(())
}