pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

use crate::instructions::*;

declare_id!("GGxDgRiGrjX6VsCrTWJZs25Hn8dPJc346RdbgpL1Wnmi");

#[program]
pub mod portal {
    use super::*;

    // Inbound Instructions

    pub fn receive_wormhole_message(ctx: Context<ReceiveMessage>) -> Result<()> {
        instructions::receive_message(ctx)
    }

    pub fn redeem(ctx: Context<Redeem>, args: RedeemArgs) -> Result<()> {
        instructions::redeem(ctx, args)
    }

    pub fn release_inbound_mint_multisig<'info>(
        ctx: Context<'_, '_, '_, 'info, ReleaseInboundMintMultisig<'info>>,
        args: ReleaseInboundArgs,
    ) -> Result<()> {
        instructions::release_inbound_mint_multisig(ctx, args)
    }

    // Outbound Instructions

    pub fn transfer_burn<'info>(
        ctx: Context<'_, '_, '_, 'info, TransferBurn<'info>>,
        args: TransferArgs,
    ) -> Result<()> {
        instructions::transfer_burn(ctx, args)
    }

    pub fn release_wormhole_outbound(
        ctx: Context<ReleaseOutbound>,
        args: ReleaseOutboundArgs,
    ) -> Result<()> {
        instructions::release_outbound(ctx, args)
    }
}
