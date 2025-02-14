use anchor_lang::prelude::*;
use ntt_messages::{chain_id::ChainId, trimmed_amount::TrimmedAmount};

use crate::{errors::PortalError, utils::Bitmap};

use super::RateLimitState;

#[account]
#[derive(InitSpace)]
pub struct OutboxItem {
    pub amount: TrimmedAmount,
    pub sender: Pubkey,
    pub recipient_chain: ChainId,
    pub recipient_ntt_manager: [u8; 32],
    pub recipient_address: [u8; 32],
    pub release_timestamp: i64,
    pub released: Bitmap,
}

impl OutboxItem {
    pub fn try_release(&mut self, transceiver_index: u8) -> Result<bool> {
        let now = Clock::get().unwrap().unix_timestamp;

        if self.release_timestamp > now {
            return Ok(false);
        }

        if self.released.get(transceiver_index)? {
            return Err(PortalError::MessageAlreadySent.into());
        }

        self.released.set(transceiver_index, true)?;

        Ok(true)
    }
}

#[account]
#[derive(InitSpace, PartialEq, Eq, Debug)]
pub struct OutboxRateLimit {
    pub rate_limit: RateLimitState,
}

/// Global rate limit for all outbound transfers to all chains.
/// NOTE: only one of this account can exist, so we don't need to check the PDA.
impl OutboxRateLimit {
    pub const SEED_PREFIX: &'static [u8] = b"outbox_rate_limit";
}
