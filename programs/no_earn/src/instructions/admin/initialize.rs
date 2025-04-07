// no_earn/instructions/admin/initialitze.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022};

// local dependencies
use crate::{
    constants::ANCHOR_DISCRIMINATOR_SIZE,
    state::{ExtGlobal, EXT_GLOBAL_SEED, MINT_AUTHORITY_SEED, M_VAULT_SEED},
};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = ANCHOR_DISCRIMINATOR_SIZE + ExtGlobal::INIT_SPACE,
        seeds = [EXT_GLOBAL_SEED],
        bump
    )]
    pub global_account: Account<'info, ExtGlobal>,

    #[account(
        token::token_program = Token2022::id(),
    )]
    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(
        token::token_program = Token2022::id(),
    )]
    pub ext_mint: InterfaceAccount<'info, Mint>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let m_vault_bump = Pubkey::find_program_address(&[M_VAULT_SEED], ctx.program_id).1;
    let ext_mint_authority_bump =
        Pubkey::find_program_address(&[MINT_AUTHORITY_SEED], ctx.program_id).1;

    ctx.accounts.global_account.set_inner(ExtGlobal {
        admin: ctx.accounts.admin.key(),
        ext_mint: ctx.accounts.ext_mint.key(),
        m_mint: ctx.accounts.m_mint.key(),
        bump: ctx.bumps.global_account,
        m_vault_bump,
        ext_mint_authority_bump,
    });

    Ok(())
}
