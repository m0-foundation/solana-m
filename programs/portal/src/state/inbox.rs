use anchor_lang::{
    prelude::*,
    solana_program::clock::{self, UnixTimestamp},
};

use crate::{errors::PortalError, utils::Bitmap};

#[account]
#[derive(InitSpace)]
pub struct InboxItem {
    // Whether the InboxItem has already been initialized. This is used during the redeem process
    // to guard against modifications to the `bump` and `amounts` fields.
    pub init: bool,
    pub bump: u8,
    pub amount: u64,
    pub recipient_address: Pubkey,
    pub votes: Bitmap,
    pub release_status: ReleaseStatus,
}

impl InboxItem {
    pub fn release_after(&mut self, release_timestamp: i64) -> Result<()> {
        if self.release_status != ReleaseStatus::NotApproved {
            return Err(PortalError::TransferCannotBeRedeemed.into());
        };
        self.release_status = ReleaseStatus::ReleaseAfter(release_timestamp);
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, InitSpace)]
pub enum ReleaseStatus {
    NotApproved,
    ReleaseAfter(i64),
    Released,
}

impl InboxItem {
    pub const SEED_PREFIX: &'static [u8] = b"inbox_item";
}

#[account]
#[derive(InitSpace)]
pub struct InboxRateLimit {
    pub bump: u8,
    pub rate_limit: RateLimitState,
}

impl InboxRateLimit {
    pub const SEED_PREFIX: &'static [u8] = b"inbox_rate_limit";
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq, Eq, Debug)]
pub struct RateLimitState {
    /// The maximum capacity of the rate limiter.
    pub limit: u64,
    /// The capacity of the rate limiter at `last_tx_timestamp`.
    /// The actual current capacity is calculated in `capacity_at`, by
    /// accounting for the time that has passed since `last_tx_timestamp` and
    /// the refill rate.
    pub capacity_at_last_tx: u64,
    /// The timestamp of the last transaction that counted towards the current
    /// capacity. Transactions that exceeded the capacity do not count, they are
    /// just delayed.
    pub last_tx_timestamp: i64,
}

impl RateLimitState {
    pub const RATE_LIMIT_DURATION: i64 = 60 * 60 * 24; // 24 hours

    pub fn capacity_at(&self, now: UnixTimestamp) -> u64 {
        assert!(self.last_tx_timestamp <= now);

        let limit = u128::from(self.limit);
        let capacity_at_last_tx = self.capacity_at_last_tx;

        let calculated_capacity = {
            let time_passed = now - self.last_tx_timestamp;
            u128::from(capacity_at_last_tx)
                + time_passed as u128 * limit / (Self::RATE_LIMIT_DURATION as u128)
        };

        calculated_capacity.min(limit) as u64
    }

    pub fn consume_or_delay(&mut self, amount: u64) -> RateLimitResult {
        let now = clock::Clock::get().unwrap().unix_timestamp;

        let capacity = self.capacity_at(now);
        if capacity >= amount {
            self.capacity_at_last_tx = capacity - amount;
            self.last_tx_timestamp = now;
            RateLimitResult::Consumed(now)
        } else {
            RateLimitResult::Delayed(now + Self::RATE_LIMIT_DURATION)
        }
    }

    pub fn refill(&mut self, now: UnixTimestamp, amount: u64) {
        self.capacity_at_last_tx = self.capacity_at(now).saturating_add(amount).min(self.limit);
        self.last_tx_timestamp = now;
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum RateLimitResult {
    /// If the rate limit is not exceeded, the transfer is immediate,
    /// and the capacity is reduced.
    Consumed(UnixTimestamp),
    /// If the rate limit is exceeded, the transfer is delayed until the
    /// given timestamp.
    Delayed(UnixTimestamp),
}
