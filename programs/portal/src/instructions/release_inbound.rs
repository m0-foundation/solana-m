use anchor_lang::prelude::*;
use anchor_m0::extension_interface::{wrap, ExtGlobal, ExtensionInterface, Wrap};
use anchor_spl::{associated_token::get_associated_token_address_with_program_id, token_interface};
use earn::cpi::accounts::PropagateIndex;
use ntt_messages::mode::Mode;
use solana_program::program::invoke_signed;
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
        address = if inbox_item.transfer.amount > 0 {
            get_associated_token_address_with_program_id(
                &inbox_item.transfer.recipient,
                &inbox_item.transfer.token_mint,
                &token_program.key(),
            )
        } else {
            recipient.key()
        }
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

    #[account(
        mut,
        address = inbox_item.transfer.token_mint,
    )]
    pub ext_mint: Option<InterfaceAccount<'info, token_interface::Mint>>,

    pub ext_program: Option<Interface<'info, ExtensionInterface>>,

    /// CHECK: the ext_program checks that this account is valid in the cpi
    pub ext_global: Option<InterfaceAccount<'info, ExtGlobal>>,

    /// CHECK: the ext_program checks that this account is valid in the cpi
    pub ext_mint_authority: Option<AccountInfo<'info>>,

    /// CHECK: the ext_program checks that this account is valid in the cpi
    pub ext_vault: Option<AccountInfo<'info>>,

    #[account(
        mut,
        associated_token::mint = ext_mint,
        associated_token::authority = ext_vault,
    )]
    pub ext_vault_token_account: Option<InterfaceAccount<'info, token_interface::TokenAccount>>,
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
    let inbox_item = &mut ctx.accounts.common.inbox_item;

    if !inbox_item.try_release()? {
        if args.revert_on_delay {
            return Err(NTTError::CantReleaseYet.into());
        }
        return Ok(());
    }

    assert!(inbox_item.release_status == ReleaseStatus::Released);

    let token_authority_sig: &[&[&[u8]]] = &[&[
        crate::TOKEN_AUTHORITY_SEED,
        &[ctx.bumps.common.token_authority],
    ]];

    if inbox_item.transfer.amount > 0 {
        // Mint then transfer to ensure transfer hook is called
        invoke_signed(
            &spl_token_2022::instruction::mint_to(
                &ctx.accounts.common.token_program.key(),
                &ctx.accounts.common.mint.key(),
                &ctx.accounts.common.custody.key(),
                &ctx.accounts.multisig.key(),
                &[&ctx.accounts.common.token_authority.key()],
                inbox_item.transfer.amount,
            )?,
            &[
                ctx.accounts.common.custody.to_account_info(),
                ctx.accounts.common.mint.to_account_info(),
                ctx.accounts.common.token_authority.to_account_info(),
                ctx.accounts.multisig.to_account_info(),
            ],
            token_authority_sig,
        )?;

        // If the target token is the base mint, we just transfer to the recipient
        // Otherwise, we wrap the base token into the supported extension
        if inbox_item.transfer.token_mint == ctx.accounts.common.mint.key() {
            onchain::invoke_transfer_checked(
                &ctx.accounts.common.token_program.key(),
                ctx.accounts.common.custody.to_account_info(),
                ctx.accounts.common.mint.to_account_info(),
                ctx.accounts.common.recipient.to_account_info(),
                ctx.accounts.common.token_authority.to_account_info(),
                ctx.remaining_accounts,
                inbox_item.transfer.amount,
                ctx.accounts.common.mint.decimals,
                token_authority_sig,
            )?;
        } else {
            let ext_mint = ctx
                .accounts
                .common
                .ext_mint
                .as_ref()
                .ok_or(NTTError::MissingRequiredAccount)?;

            let ext_program = ctx
                .accounts
                .common
                .ext_program
                .as_ref()
                .ok_or(NTTError::MissingRequiredAccount)?;

            let ext_global = ctx
                .accounts
                .common
                .ext_global
                .as_ref()
                .ok_or(NTTError::MissingRequiredAccount)?;

            let ext_mint_authority = ctx
                .accounts
                .common
                .ext_mint_authority
                .as_ref()
                .ok_or(NTTError::MissingRequiredAccount)?;

            let ext_vault = ctx
                .accounts
                .common
                .ext_vault
                .as_ref()
                .ok_or(NTTError::MissingRequiredAccount)?;

            let ext_vault_token_account = ctx
                .accounts
                .common
                .ext_vault_token_account
                .as_ref()
                .ok_or(NTTError::MissingRequiredAccount)?;

            let ctx = CpiContext::new_with_signer(
                ext_program.to_account_info(),
                Wrap {
                    signer: ctx.accounts.common.token_authority.to_account_info(),
                    m_mint: ctx.accounts.common.mint.to_account_info(),
                    ext_mint: ext_mint.to_account_info(),
                    global_account: ext_global.to_account_info(),
                    m_vault: ext_vault.clone(),
                    ext_mint_authority: ext_mint_authority.to_account_info(),
                    from_m_token_account: ctx.accounts.common.custody.to_account_info(),
                    vault_m_token_account: ext_vault_token_account.to_account_info(),
                    to_ext_token_account: ctx.accounts.common.recipient.to_account_info(),
                    token_2022: ctx.accounts.common.token_program.to_account_info(),
                },
                token_authority_sig,
            );

            wrap(ctx, inbox_item.transfer.amount)?;
        }
    }

    // Send update to the earn program
    {
        let expected_accounts = &ctx
            .accounts
            .common
            .config
            .release_inbound_remaining_accounts;

        // Remaining accounts required for CPI to earn program
        if ctx.remaining_accounts.len() < expected_accounts.len() {
            return err!(NTTError::InvalidRemainingAccount);
        }

        for (i, account) in expected_accounts.iter().enumerate() {
            if account.pubkey != ctx.remaining_accounts[i].key() {
                return err!(NTTError::InvalidRemainingAccount);
            }
        }

        let ctx = CpiContext::new_with_signer(
            ctx.remaining_accounts[0].clone(),
            PropagateIndex {
                signer: ctx.accounts.common.token_authority.to_account_info(),
                global_account: ctx.remaining_accounts[1].clone(),
                mint: ctx.accounts.common.mint.to_account_info(),
            },
            token_authority_sig,
        );

        let root_updates = inbox_item.root_updates.clone().unwrap_or_default();
        earn::cpi::propagate_index(ctx, inbox_item.index_update, root_updates.earner_root)?;

        msg!(
            "Index update: {} | root update: {}",
            inbox_item.index_update,
            inbox_item.root_updates.is_some()
        );
    }

    Ok(())
}
