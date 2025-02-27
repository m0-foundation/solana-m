// earn/utils/token.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::spl_token_2022,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use solana_program::program::invoke_signed;

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
    let cpi_context = CpiContext::new_with_signer(
        token_program.to_account_info(),
        transfer_options,
        authority_seeds,
    );

    // Call the transfer instruction
    transfer_checked(cpi_context, *amount, mint.decimals)?;

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
    transfer_checked(cpi_context, *amount, mint.decimals)?;

    Ok(())
}

// Convenience functions to mint and burn tokens from a program using a PDA signer

pub fn mint_tokens<'info>(
    to: &InterfaceAccount<'info, TokenAccount>,
    amount: &u64,
    mint: &InterfaceAccount<'info, Mint>,
    multisig_authority: &AccountInfo<'info>,
    signer: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    // Send a CPI with the signer seeds as the signer
    invoke_signed(
        &spl_token_2022::instruction::mint_to(
            token_program.to_account_info().key,
            mint.to_account_info().key,
            to.to_account_info().key,
            multisig_authority.key,
            &[signer.key],
            *amount,
        )?,
        &[
            mint.to_account_info(),
            to.to_account_info(),
            multisig_authority.clone(),
            signer.clone(),
        ],
        signer_seeds,
    )?;

    Ok(())
}
