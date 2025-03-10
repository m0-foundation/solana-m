// earn/utils/token.rs

// external dependencies
use ::spl_token_2022::extension::immutable_owner::ImmutableOwner;
use ::spl_token_2022::extension::BaseStateWithExtensionsMut;
use ::spl_token_2022::extension::PodStateWithExtensionsMut;
use ::spl_token_2022::pod::PodAccount;
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

pub fn has_immutable_owner<'info>(token_account: &InterfaceAccount<'info, TokenAccount>) -> bool {
    let account_info = token_account.to_account_info();
    let mut data = account_info.data.borrow_mut();

    match PodStateWithExtensionsMut::<PodAccount>::unpack(&mut data) {
        Ok(mut account) => account.get_extension_mut::<ImmutableOwner>().is_ok(),
        Err(_) => return false,
    }
}
