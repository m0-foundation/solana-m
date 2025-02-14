use anchor_lang::{prelude::*, solana_program::keccak};
use anchor_spl::{
    token_2022::{burn, spl_token_2022::onchain::invoke_transfer_checked, Burn},
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use ntt_messages::{chain_id::ChainId, mode::Mode, trimmed_amount::TrimmedAmount};

use crate::{
    errors::PortalError,
    state::*,
    utils::{Bitmap, SESSION_AUTHORITY_SEED, TOKEN_AUTHORITY_SEED},
};

#[derive(Accounts)]
pub struct Transfer<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(constraint = !config.enabled_transceivers.is_empty() @ PortalError::NoRegisteredTransceivers)]
    pub config: NotPausedConfig<'info>,

    #[account(
        mut,
        address = config.mint,
    )]
    /// CHECK: the mint address matches the config
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
    )]
    /// CHECK: the spl token program will check that the session_authority account can spend these tokens.
    pub from: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,

    #[account(
        init,
        payer = payer,
        space = 8 + OutboxItem::INIT_SPACE,
    )]
    pub outbox_item: Account<'info, OutboxItem>,

    #[account(mut)]
    pub outbox_rate_limit: Account<'info, OutboxRateLimit>,

    #[account(
        mut,
        address = config.custody
    )]
    pub custody: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TransferArgs {
    pub amount: u64,
    pub recipient_chain: ChainId,
    pub recipient_address: [u8; 32],
    pub should_queue: bool,
}

impl TransferArgs {
    pub fn keccak256(&self) -> keccak::Hash {
        let TransferArgs {
            amount,
            recipient_chain,
            recipient_address,
            should_queue,
        } = self;
        keccak::hashv(&[
            amount.to_be_bytes().as_ref(),
            recipient_chain.id.to_be_bytes().as_ref(),
            recipient_address,
            &[u8::from(*should_queue)],
        ])
    }
}

// Burn/mint

#[derive(Accounts)]
#[instruction(args: TransferArgs)]
pub struct TransferBurn<'info> {
    #[account(
        constraint = common.config.mode == Mode::Burning @ PortalError::InvalidMode,
    )]
    pub common: Transfer<'info>,

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

    #[account(
        seeds = [
            SESSION_AUTHORITY_SEED,
            common.from.owner.as_ref(),
            args.keccak256().as_ref()
        ],
        bump,
    )]
    /// CHECK: The seeds constraint enforces that this is the correct account.
    pub session_authority: UncheckedAccount<'info>,

    #[account(
        seeds = [TOKEN_AUTHORITY_SEED],
        bump,
    )]
    /// CHECK: The seeds constraint enforces that this is the correct account.
    pub token_authority: UncheckedAccount<'info>,
}

pub fn transfer_burn<'info>(
    ctx: Context<'_, '_, '_, 'info, TransferBurn<'info>>,
    args: TransferArgs,
) -> Result<()> {
    let accs = ctx.accounts;

    let TransferArgs {
        mut amount,
        recipient_chain,
        recipient_address,
        should_queue,
    } = args;

    // TODO: should we revert if we have dust?
    let trimmed_amount = TrimmedAmount::remove_dust(
        &mut amount,
        accs.common.mint.decimals,
        accs.peer.token_decimals,
    )
    .map_err(PortalError::from)?;

    let before = accs.common.custody.amount;

    // NOTE: burning tokens is a two-step process:
    // 1. Transfer the tokens to the custody account
    // 2. Burn the tokens from the custody account
    //
    // This is done to ensure that if the token has a transfer hook defined, it
    // will be called before the tokens are burned.
    // Unfortunately the Token2022 program doesn't trigger transfer hooks when
    // burning tokens, so we have to do it "manually" via a transfer.
    //
    // If we didn't do this, transfer hooks could be bypassed by transferring
    // the tokens out through NTT first, then back in to the intended recipient.
    //
    // The [`release_inbound_mint`] function operates in a similar way
    // (mint to custody, *then* transfer to recipient).

    // Step 1: transfer to custody account
    invoke_transfer_checked(
        &accs.common.token_program.key(),
        accs.common.from.to_account_info(),
        accs.common.mint.to_account_info(),
        accs.common.custody.to_account_info(),
        accs.session_authority.to_account_info(),
        ctx.remaining_accounts,
        amount,
        accs.common.mint.decimals,
        &[&[
            SESSION_AUTHORITY_SEED,
            accs.common.from.owner.as_ref(),
            args.keccak256().as_ref(),
            &[ctx.bumps.session_authority],
        ]],
    )?;

    // Step 2: burn the tokens from the custody account
    burn(
        CpiContext::new_with_signer(
            accs.common.token_program.to_account_info(),
            Burn {
                mint: accs.common.mint.to_account_info(),
                from: accs.common.custody.to_account_info(),
                authority: accs.token_authority.to_account_info(),
            },
            &[&[TOKEN_AUTHORITY_SEED, &[ctx.bumps.token_authority]]],
        ),
        amount,
    )?;

    accs.common.custody.reload()?;
    let after = accs.common.custody.amount;

    // NOTE: we currently do not support tokens with fees. Support could be
    // added, but it would require the client to calculate the amount _before_
    // paying fees that results in an amount that can safely be trimmed.
    // Otherwise, if the amount after paying fees has dust, then that amount
    // would be lost.
    // To support fee tokens, we would first transfer the amount, _then_ assert
    // that the resulting amount has no dust (instead of removing dust before
    // the transfer like we do now). We would also need to burn the new amount
    // _after_ paying fees so as to not burn more than what was transferred to
    // the custody.
    if after != before {
        return Err(PortalError::BadAmountAfterBurn.into());
    }

    let recipient_ntt_manager = accs.peer.address;

    insert_into_outbox(
        &mut accs.common,
        &mut accs.inbox_rate_limit,
        amount,
        trimmed_amount,
        recipient_chain,
        recipient_ntt_manager,
        recipient_address,
        should_queue,
    )?;

    Ok(())
}

fn insert_into_outbox(
    common: &mut Transfer<'_>,
    inbox_rate_limit: &mut InboxRateLimit,
    amount: u64,
    trimmed_amount: TrimmedAmount,
    recipient_chain: ChainId,
    recipient_ntt_manager: [u8; 32],
    recipient_address: [u8; 32],
    should_queue: bool,
) -> Result<()> {
    // consume the rate limit, or delay the transfer if it's outside the limit
    let release_timestamp = match common.outbox_rate_limit.rate_limit.consume_or_delay(amount) {
        RateLimitResult::Consumed(now) => {
            // When sending a transfer, we refill the inbound rate limit for
            // that chain the same amount (we call this "backflow")
            inbox_rate_limit.rate_limit.refill(now, amount);
            now
        }
        RateLimitResult::Delayed(release_timestamp) => {
            if !should_queue {
                return Err(PortalError::TransferExceedsRateLimit.into());
            }
            release_timestamp
        }
    };

    common.outbox_item.set_inner(OutboxItem {
        amount: trimmed_amount,
        sender: common.from.owner,
        recipient_chain,
        recipient_ntt_manager,
        recipient_address,
        release_timestamp,
        released: Bitmap::new(),
    });

    Ok(())
}
