use anchor_lang::prelude::*;

use super::RateLimitState;

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
