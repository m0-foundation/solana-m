use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct TransceiverPeer {
    pub bump: u8,
    pub address: [u8; 32],
}

impl TransceiverPeer {
    pub const SEED_PREFIX: &'static [u8] = b"transceiver_peer";
}
