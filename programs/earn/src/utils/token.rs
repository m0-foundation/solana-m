// earn/utils/token.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::spl_token_2022,
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use solana_program::program::invoke_signed;

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
