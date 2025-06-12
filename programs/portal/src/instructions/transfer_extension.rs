use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{burn, Burn, Mint, TokenAccount, TokenInterface},
};

use crate::{
    bitmap::Bitmap,
    config::*,
    error::NTTError,
    instructions::{BridgeEvent, TransferArgs},
    ntt_messages::TrimmedAmount,
    peer::NttManagerPeer,
    queue::{
        inbox::InboxRateLimit,
        outbox::{OutboxItem, OutboxRateLimit},
    },
    release_amount,
};

#[derive(Accounts)]
#[instruction(args: TransferArgs)]
pub struct TransferExtensionBurn<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    // Ensure that there exists at least one enabled transceiver
    #[account(constraint = !config.enabled_transceivers.is_empty() @ NTTError::NoRegisteredTransceivers)]
    pub config: NotPausedConfig<'info>,

    #[account(mut, address = config.mint)]
    pub m_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub ext_mint: InterfaceAccount<'info, Mint>,

    // Account the receives M on unwrap before it gets burned
    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = m_mint,
        associated_token::authority = signer,
        associated_token::token_program = m_token_program,
    )]
    pub m_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub ext_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = signer,
        space = 8 + OutboxItem::INIT_SPACE,
    )]
    pub outbox_item: Account<'info, OutboxItem>,

    #[account(mut)]
    pub outbox_rate_limit: Account<'info, OutboxRateLimit>,

    #[account(
        mut,
        seeds = [InboxRateLimit::SEED_PREFIX, args.recipient_chain.id.to_be_bytes().as_ref()],
        bump = inbox_rate_limit.bump,
    )]
    pub inbox_rate_limit: Account<'info, InboxRateLimit>,

    #[account(
        seeds = [NttManagerPeer::SEED_PREFIX, args.recipient_chain.id.to_be_bytes().as_ref()],
        bump = peer.bump,
    )]
    pub peer: Account<'info, NttManagerPeer>,

    pub ext_token_program: Interface<'info, TokenInterface>,

    pub m_token_program: Interface<'info, TokenInterface>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

pub fn transfer_extension_burn<'info>(
    ctx: Context<'_, '_, '_, 'info, TransferExtensionBurn<'info>>,
    args: TransferArgs,
) -> Result<()> {
    let accs = ctx.accounts;

    let TransferArgs {
        mut amount,
        recipient_chain,
        recipient_address,
        should_queue,
    } = args;

    let trimmed_amount =
        TrimmedAmount::remove_dust(&mut amount, accs.m_mint.decimals, accs.peer.token_decimals)
            .map_err(NTTError::from)?;

    // Burn $M tokens being bridged
    burn(
        CpiContext::new(
            accs.m_token_program.to_account_info(),
            Burn {
                mint: accs.m_mint.to_account_info(),
                from: accs.m_token_account.to_account_info(),
                authority: accs.signer.to_account_info(),
            },
        ),
        amount,
    )?;

    // Release, queue, or error
    let release_timestamp = release_amount(
        &mut accs.outbox_rate_limit,
        &mut accs.inbox_rate_limit,
        amount,
        should_queue,
    )?;

    // Create outbox item to be released and relayed
    accs.outbox_item.set_inner(OutboxItem {
        amount: trimmed_amount,
        sender: accs.m_token_account.owner,
        recipient_chain,
        recipient_ntt_manager: accs.peer.address,
        recipient_address,
        destination_token: accs.config.evm_token,
        release_timestamp,
        released: Bitmap::new(),
    });

    accs.m_mint.reload()?;

    emit!(BridgeEvent {
        amount: -(amount as i64),
        token_supply: accs.m_mint.supply,
        to: recipient_address,
        from: accs.ext_token_account.owner.to_bytes(),
        wormhole_chain_id: recipient_chain.id,
    });

    Ok(())
}
