// ext_earn/instructions/admin/initialitze.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022};

// local dependencies
use crate::{
    constants::{
        ANCHOR_DISCRIMINATOR_SIZE,
        EARN_PROGRAM,
    },
    errors::ExtError,
    state::{
        ExtGlobal, EXT_GLOBAL_SEED,
        M_VAULT_SEED,
        MINT_AUTHORITY_SEED,
    },
};
use earn::state::{
    Global as EarnGlobal,
    GLOBAL_SEED as EARN_GLOBAL_SEED,
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
        token::token_program = token_2022
    )]
    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(
        token::token_program = token_2022
    )]
    pub ext_mint: InterfaceAccount<'info, Mint>,

    pub m_earn_global_account: Account<'info, EarnGlobal>,

    pub token_2022: Program<'info, Token2022>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    earn_authority: Pubkey,
) -> Result<()> {
    let m_earn_global_account = Pubkey::find_program_address(&[EARN_GLOBAL_SEED], &EARN_PROGRAM).0;

    if ctx.accounts.m_earn_global_account.key() != m_earn_global_account {
        return err!(ExtError::InvalidAccount);
    }

    let m_vault_bump = Pubkey::find_program_address(&[M_VAULT_SEED], ctx.program_id).1;

    let ext_mint_authority_bump = Pubkey::find_program_address(&[MINT_AUTHORITY_SEED], ctx.program_id).1;

    ctx.accounts.global_account.set_inner(ExtGlobal {
        admin: ctx.accounts.admin.key(),
        earn_authority,
        ext_mint: ctx.accounts.ext_mint.key(),
        m_mint: ctx.accounts.m_mint.key(),
        m_earn_global_account,
        index: ctx.accounts.m_earn_global_account.index,
        timestamp: ctx.accounts.m_earn_global_account.timestamp,
        bump: ctx.bumps.global_account,
        m_vault_bump,
        ext_mint_authority_bump,
    });

    Ok(())
}
