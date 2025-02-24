
// earn/utils/token.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{
        transfer_checked,
        Burn, 
        burn, 
        Mint,
        // mint_to, 
        TokenAccount, 
        TokenInterface, 
        TransferChecked
    }, 
    token_2022::spl_token_2022::instruction::mint_to_checked
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
    multisig_authority: &AccountInfo<'info>,
    signer: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    // Build the arguments for the mint instruction
    // let cpi_context = CpiContext::new_with_signer(
    //     token_program.to_account_info(),
    //     vec![
    //         mint.to_account_info(),
    //         to.to_account_info(),
    //         multisig_authority.clone(),
    //         signer.clone(),
    //     ],
    //     signer_seeds);

    // // Call the mint instruction
    // mint_to(
    //     cpi_context,
    //     *amount
    // )?;

    let ix = mint_to_checked(
        token_program.to_account_info().key,
        mint.to_account_info().key,
        to.to_account_info().key,
        multisig_authority.key,
        &[signer.key],
        *amount,
        6u8,
    )?;
    
    invoke_signed(
        &ix,
        &[mint.to_account_info(), to.to_account_info(), multisig_authority.clone(), signer.clone()],
        signer_seeds
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