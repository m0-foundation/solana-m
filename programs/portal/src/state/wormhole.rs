use anchor_lang::prelude::*;
use wormhole_anchor_sdk::wormhole::{program, BridgeData};

#[derive(Accounts)]
pub struct WormholeAccounts<'info> {
    #[account(mut)]
    /// CHECK: address will be checked by the wormhole core bridge
    pub bridge: Account<'info, BridgeData>,

    #[account(mut)]
    /// CHECK: account will be checked by the wormhole core bridge
    pub fee_collector: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: account will be checked and maybe initialized by the wormhole core bridge
    pub sequence: UncheckedAccount<'info>,

    pub program: Program<'info, program::Wormhole>,

    pub system_program: Program<'info, System>,

    // legacy
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
}
