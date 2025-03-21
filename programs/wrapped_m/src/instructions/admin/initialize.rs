// wrapped-m/instructions/admin/initialize.rs

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022};

use earn::state::GLOBAL_SEED as EARN_GLOBAL_SEED;
use crate::{
    constants::{
        ANCHOR_DISCRIMINATOR_SIZE,
        EARN_PROGRAM,
    },
    errors::wMError,
    state::{
        Global, GLOBAL_SEED,
        M_VAULT_SEED,
        MINT_AUTHORITY_SEED,
    },
    utils::earn_global::load_earn_global_data,
};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = ANCHOR_DISCRIMINATOR_SIZE + Global::INIT_SPACE,
        seeds = [GLOBAL_SEED],
        bump
    )]
    pub global_account: Account<'info, Global>,

    pub token_2022: Program<'info, Token2022>,

    #[account(token::token_program = token_2022)]
    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(token::token_program = token_2022)]
    pub ext_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: We manually validate this account in the instruction handler
    pub m_earn_global_account: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    earn_authority: Pubkey,
) -> Result<()> {

    // Calculate and verify the M earn program's global account
    let m_earn_global_account = Pubkey::find_program_address(
        &[EARN_GLOBAL_SEED],
        &EARN_PROGRAM
    ).0;

    if ctx.accounts.m_earn_global_account.key() != m_earn_global_account {
        return err!(wMError::InvalidAccount); 
    }

    let m_earn_global = load_earn_global_data(&ctx.accounts.m_earn_global_account)?;

    // Calculate the bumps for the m vault and extension mint authority PDAs
    let m_vault_bump = Pubkey::find_program_address(
        &[M_VAULT_SEED],
        ctx.program_id
    ).1;

    let ext_mint_authority_bump = Pubkey::find_program_address(
        &[MINT_AUTHORITY_SEED],
        ctx.program_id
    ).1;

    // Set the global account data
    ctx.accounts.global_account.set_inner(Global {
        admin: ctx.accounts.admin.key(),
        m_mint: ctx.accounts.m_mint.key(),
        ext_mint: ctx.accounts.ext_mint.key(),
        m_earn_global_account,
        earn_authority,
        index: m_earn_global.index,
        timestamp: m_earn_global.timestamp,
        bump: ctx.bumps.global_account,
        m_vault_bump,
        ext_mint_authority_bump,
    });

    Ok(())
}
