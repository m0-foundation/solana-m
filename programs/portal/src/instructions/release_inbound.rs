use anchor_lang::prelude::*;
use anchor_spl::{associated_token::get_associated_token_address_with_program_id, token_interface};
use ntt_messages::mode::Mode;
use spl_token_2022::onchain;

use crate::{
    config::*,
    error::NTTError,
    queue::inbox::{InboxItem, ReleaseStatus},
    spl_multisig::SplMultisig,
};

#[derive(Accounts)]
pub struct ReleaseInbound<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub config: NotPausedConfig<'info>,

    #[account(mut)]
    pub inbox_item: Account<'info, InboxItem>,

    #[account(
        mut,
        address = match inbox_item.recipient_address {
            Some(addr) => get_associated_token_address_with_program_id(
                &addr,
                &mint.key(),
                &token_program.key(),
            ),
            None => recipient.key(),
        },
    )]
    pub recipient: InterfaceAccount<'info, token_interface::TokenAccount>,

    #[account(
        seeds = [crate::TOKEN_AUTHORITY_SEED],
        bump,
    )]
    /// CHECK The seeds constraint ensures that this is the correct address
    pub token_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        address = config.mint,
    )]
    /// CHECK: the mint address matches the config
    pub mint: InterfaceAccount<'info, token_interface::Mint>,

    pub token_program: Interface<'info, token_interface::TokenInterface>,

    /// CHECK: the token program checks if this indeed the right authority for the mint
    #[account(
        mut,
        address = config.custody
    )]
    pub custody: InterfaceAccount<'info, token_interface::TokenAccount>,
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct ReleaseInboundArgs {
    pub revert_on_delay: bool,
}

#[derive(Accounts)]
pub struct ReleaseInboundMintMultisig<'info> {
    #[account(
        constraint = common.config.mode == Mode::Burning @ NTTError::InvalidMode,
    )]
    common: ReleaseInbound<'info>,

    #[account(
        constraint =
         multisig.m == 1 && multisig.signers.contains(&common.token_authority.key())
            @ NTTError::InvalidMultisig,
    )]
    pub multisig: InterfaceAccount<'info, SplMultisig>,
}

pub fn release_inbound_mint_multisig<'info>(
    ctx: Context<'_, '_, '_, 'info, ReleaseInboundMintMultisig<'info>>,
    args: ReleaseInboundArgs,
) -> Result<()> {
    let inbox_item = release_inbox_item(&mut ctx.accounts.common.inbox_item, args.revert_on_delay)?;
    if inbox_item.is_none() {
        return Ok(());
    }

    let inbox_item = inbox_item.unwrap();
    assert!(inbox_item.release_status == ReleaseStatus::Released);

    // index update
    if let Some(index_update) = inbox_item.index_update {
        msg!("Updating index: {}", index_update);
        return Ok(());
    }

    // no transfer on message
    if inbox_item.amount.is_none() {
        return Ok(());
    }

    // NOTE: minting tokens is a two-step process:
    // 1. Mint tokens to the custody account
    // 2. Transfer the tokens from the custody account to the recipient
    //
    // This is done to ensure that if the token has a transfer hook defined, it
    // will be called after the tokens are minted.
    // Unfortunately the Token2022 program doesn't trigger transfer hooks when
    // minting tokens, so we have to do it "manually" via a transfer.
    //
    // If we didn't do this, transfer hooks could be bypassed by transferring
    // the tokens out through NTT first, then back in to the intended recipient.
    //
    // The [`transfer_burn`] function operates in a similar way
    // (transfer to custody from sender, *then* burn).

    let token_authority_sig: &[&[&[u8]]] = &[&[
        crate::TOKEN_AUTHORITY_SEED,
        &[ctx.bumps.common.token_authority],
    ]];

    // Step 1: mint tokens to the custody account
    solana_program::program::invoke_signed(
        &spl_token_2022::instruction::mint_to(
            &ctx.accounts.common.token_program.key(),
            &ctx.accounts.common.mint.key(),
            &ctx.accounts.common.custody.key(),
            &ctx.accounts.multisig.key(),
            &[&ctx.accounts.common.token_authority.key()],
            inbox_item.amount.unwrap(),
        )?,
        &[
            ctx.accounts.common.custody.to_account_info(),
            ctx.accounts.common.mint.to_account_info(),
            ctx.accounts.common.token_authority.to_account_info(),
            ctx.accounts.multisig.to_account_info(),
        ],
        token_authority_sig,
    )?;

    // Step 2: transfer the tokens from the custody account to the recipient
    onchain::invoke_transfer_checked(
        &ctx.accounts.common.token_program.key(),
        ctx.accounts.common.custody.to_account_info(),
        ctx.accounts.common.mint.to_account_info(),
        ctx.accounts.common.recipient.to_account_info(),
        ctx.accounts.common.token_authority.to_account_info(),
        ctx.remaining_accounts,
        inbox_item.amount.unwrap(),
        ctx.accounts.common.mint.decimals,
        token_authority_sig,
    )?;

    msg!(
        "Transferred {} tokens to {}",
        inbox_item.amount.unwrap(),
        inbox_item.recipient_address.unwrap()
    );

    Ok(())
}

fn release_inbox_item(
    inbox_item: &mut InboxItem,
    revert_on_delay: bool,
) -> Result<Option<&mut InboxItem>> {
    if inbox_item.try_release()? {
        Ok(Some(inbox_item))
    } else if revert_on_delay {
        Err(NTTError::CantReleaseYet.into())
    } else {
        Ok(None)
    }
}
