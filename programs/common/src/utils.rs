// common/utils.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked,
    Burn, 
    burn, 
    Mint, 
    MintTo, 
    mint_to, 
    TokenAccount, 
    TokenInterface, 
    TransferChecked
};

// local dependencies
// use crate::constants::ONE;

// This file contains general helper functions used throughout the program

// pub fn get_principal_rounded_down(amount: u64, index: u64) -> u64 {
//     amount * ONE / index
// }

// pub fn get_principal_rounded_up(amount: u64, index: u64) -> u64 {
//     (amount * ONE + index - 1) / index
// }

// pub fn get_amount_rounded_down(principal: u64, index: u64) -> u64 {
//     principal * index / ONE
// }

// pub fn get_amount_rounded_up(principal: u64, index: u64) -> u64 {
//     (principal * index + ONE - 1) / ONE
// }

pub fn transfer_tokens_from_program<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    amount: &u64,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    authority_seeds: &[&[&[u8]]],
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    // Build the arguments for the transfer instruction
    let transfer_options = TransferChecked {
        from: from.to_account_info(),
        to: to.to_account_info(),
        mint: mint.to_account_info(),
        authority: authority.clone(),
    };
    let cpi_context = CpiContext::new_with_signer(token_program.to_account_info(), transfer_options, authority_seeds);

    // Call the transfer instruction
    transfer_checked(
        cpi_context,
        *amount,
        mint.decimals,
    )?;

    Ok(())
}

pub fn transfer_tokens<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    amount: &u64,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    // Build the arguments for the transfer instruction
    let transfer_options = TransferChecked {
        from: from.to_account_info(),
        to: to.to_account_info(),
        mint: mint.to_account_info(),
        authority: authority.clone(),
    };
    let cpi_context = CpiContext::new(token_program.to_account_info(), transfer_options);

    // Call the transfer instruction
    transfer_checked(
        cpi_context,
        *amount,
        mint.decimals,
    )?;

    Ok(())
}

// Convenience functions to mint and burn tokens from a program using a PDA signer

pub fn mint_tokens<'info>(
    to: &InterfaceAccount<'info, TokenAccount>,
    amount: &u64,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    authority_seeds: &[&[&[u8]]],
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    // Build the arguments for the mint instruction
    let mint_options = MintTo {
        mint: mint.to_account_info(),
        to: to.to_account_info(),
        authority: authority.clone(),
    };

    let cpi_context = CpiContext::new_with_signer(token_program.to_account_info(), mint_options, authority_seeds);

    // Call the mint instruction
    mint_to(
        cpi_context,
        *amount,
    )?;

    Ok(())
}

pub fn burn_tokens<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    amount: &u64,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    // Build the arguments for the burn instruction
    let burn_options = Burn {
        mint: mint.to_account_info(),
        from: from.to_account_info(),
        authority: authority.clone(),
    };

    let cpi_context = CpiContext::new(token_program.to_account_info(), burn_options);

    // Call the burn instruction
    burn(
        cpi_context,
        *amount,
    )?;

    Ok(())
}