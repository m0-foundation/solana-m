use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct RegisteredTransceiver {
    pub bump: u8,
    pub id: u8,
    pub transceiver_address: Pubkey,
}

impl RegisteredTransceiver {
    pub const SEED_PREFIX: &'static [u8] = b"registered_transceiver";
}

#[account]
#[derive(InitSpace)]
pub struct TransceiverPeer {
    pub bump: u8,
    pub address: [u8; 32],
}

impl TransceiverPeer {
    pub const SEED_PREFIX: &'static [u8] = b"transceiver_peer";
}

#[account]
#[derive(InitSpace)]
pub struct NttManagerPeer {
    pub bump: u8,
    pub address: [u8; 32],
    pub token_decimals: u8,
}

impl NttManagerPeer {
    pub const SEED_PREFIX: &'static [u8] = b"peer";
}
