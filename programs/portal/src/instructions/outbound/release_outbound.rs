use anchor_lang::prelude::*;
use ntt_messages::{
    ntt::{EmptyPayload, NativeTokenTransfer},
    ntt_manager::NttManagerMessage,
    transceiver::TransceiverMessage,
    transceivers::wormhole::WormholeTransceiver,
};
use wormhole_anchor_sdk::wormhole::{self, Finality};
use wormhole_io::TypePrefixedPayload;

use crate::{errors::PortalError, state::*};

#[derive(Accounts)]
pub struct ReleaseOutbound<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub config: NotPausedConfig<'info>,

    #[account(
        mut,
        constraint = !outbox_item.released.get(transceiver.id)? @ PortalError::MessageAlreadySent,
    )]
    pub outbox_item: Account<'info, OutboxItem>,

    #[account(
        constraint = transceiver.transceiver_address == crate::ID,
        constraint = config.enabled_transceivers.get(transceiver.id)? @ PortalError::DisabledTransceiver
    )]
    pub transceiver: Account<'info, RegisteredTransceiver>,

    #[account(
        mut,
        seeds = [b"message", outbox_item.key().as_ref()],
        bump,
    )]
    /// CHECK: initialized and written to by wormhole core bridge
    pub wormhole_message: UncheckedAccount<'info>,

    #[account(
        seeds = [b"emitter"],
        bump
    )]
    /// CHECK: wormhole uses this as the emitter address
    pub emitter: UncheckedAccount<'info>,

    pub wormhole: WormholeAccounts<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ReleaseOutboundArgs {
    pub revert_on_delay: bool,
}

pub fn release_outbound(ctx: Context<ReleaseOutbound>, args: ReleaseOutboundArgs) -> Result<()> {
    let accs = ctx.accounts;
    let released = accs.outbox_item.try_release(accs.transceiver.id)?;

    if !released {
        if args.revert_on_delay {
            return Err(PortalError::CantReleaseYet.into());
        } else {
            return Ok(());
        }
    }

    assert!(accs.outbox_item.released.get(accs.transceiver.id)?);
    let message: TransceiverMessage<WormholeTransceiver, NativeTokenTransfer<EmptyPayload>> =
        TransceiverMessage::new(
            accs.outbox_item.to_account_info().owner.to_bytes(),
            accs.outbox_item.recipient_ntt_manager,
            NttManagerMessage {
                id: accs.outbox_item.key().to_bytes(),
                sender: accs.outbox_item.sender.to_bytes(),
                payload: NativeTokenTransfer {
                    amount: accs.outbox_item.amount,
                    source_token: accs.config.mint.to_bytes(),
                    to: accs.outbox_item.recipient_address,
                    to_chain: accs.outbox_item.recipient_chain,
                    additional_payload: EmptyPayload {},
                },
            },
            vec![],
        );

    post_message(
        &accs.wormhole,
        accs.payer.to_account_info(),
        accs.wormhole_message.to_account_info(),
        accs.emitter.to_account_info(),
        ctx.bumps.emitter,
        &message,
        &[&[
            b"message",
            accs.outbox_item.key().as_ref(),
            &[ctx.bumps.wormhole_message],
        ]],
    )?;

    Ok(())
}

pub fn post_message<'info, A: TypePrefixedPayload>(
    wormhole: &WormholeAccounts<'info>,
    payer: AccountInfo<'info>,
    message: AccountInfo<'info>,
    emitter: AccountInfo<'info>,
    emitter_bump: u8,
    payload: &A,
    additional_seeds: &[&[&[u8]]],
) -> Result<()> {
    let batch_id = 0;

    pay_wormhole_fee(wormhole, &payer)?;

    let ix = wormhole::PostMessage {
        config: wormhole.bridge.to_account_info(),
        message,
        emitter,
        sequence: wormhole.sequence.to_account_info(),
        payer: payer.to_account_info(),
        fee_collector: wormhole.fee_collector.to_account_info(),
        clock: wormhole.clock.to_account_info(),
        rent: wormhole.rent.to_account_info(),
        system_program: wormhole.system_program.to_account_info(),
    };

    let seeds: &[&[&[&[u8]]]] = &[
        &[&[b"emitter".as_slice(), &[emitter_bump]]],
        additional_seeds,
    ];

    wormhole::post_message(
        CpiContext::new_with_signer(wormhole.program.to_account_info(), ix, &seeds.concat()),
        batch_id,
        TypePrefixedPayload::to_vec_payload(payload),
        Finality::Finalized, // set to confirmed for devnet
    )?;

    Ok(())
}

fn pay_wormhole_fee<'info>(
    wormhole: &WormholeAccounts<'info>,
    payer: &AccountInfo<'info>,
) -> Result<()> {
    if wormhole.bridge.fee() > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new(
                wormhole.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: payer.to_account_info(),
                    to: wormhole.fee_collector.to_account_info(),
                },
            ),
            wormhole.bridge.fee(),
        )?;
    }

    Ok(())
}
