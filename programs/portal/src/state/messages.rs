use anchor_lang::prelude::*;
use ntt_messages::{chain_id::ChainId, transceiver::TransceiverMessageData};

#[account]
#[derive(InitSpace)]
pub struct ValidatedTransceiverMessage<A: AnchorDeserialize + AnchorSerialize + Space + Clone> {
    pub from_chain: ChainId,
    pub message: TransceiverMessageData<A>,
}

impl<A: AnchorDeserialize + AnchorSerialize + Space + Clone> ValidatedTransceiverMessage<A> {
    pub const SEED_PREFIX: &'static [u8] = b"transceiver_message";
}
