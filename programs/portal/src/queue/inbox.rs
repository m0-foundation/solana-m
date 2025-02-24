use std::ops::{Deref, DerefMut};

use anchor_lang::prelude::*;

use crate::{
    bitmap::Bitmap,
    clock::current_timestamp,
    error::NTTError,
    payloads::{token_transfer::NativeTokenTransfer, IndexTransfer},
};

use super::rate_limit::RateLimitState;

#[account]
#[derive(InitSpace)]
pub struct InboxItem {
    // Whether the InboxItem has already been initialized. This is used during the redeem process
    // to guard against modifications to the `bump` and `amounts` fields.
    pub init: bool,
    pub bump: u8,
    pub votes: Bitmap,
    pub release_status: ReleaseStatus,
    pub value: InboxValue,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub enum InboxValue {
    TokenTransfer(TokenTransfer),
    IndexUpdate(u128),
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct TokenTransfer {
    pub amount: u64,
    pub recipient_address: Pubkey,
}

impl InboxValue {
    pub fn from_ntt(ntt: &NativeTokenTransfer, decimals: u8) -> Result<Self> {
        let amount = ntt.amount.untrim(decimals).map_err(NTTError::from)?;

        let recipient_address =
            Pubkey::try_from(ntt.to).map_err(|_| NTTError::InvalidRecipientAddress)?;

        Ok(InboxValue::TokenTransfer(TokenTransfer {
            amount,
            recipient_address,
        }))
    }

    pub fn from_index_update(it: &IndexTransfer) -> Result<Self> {
        Ok(InboxValue::IndexUpdate(it.index))
    }
}

/// The status of an InboxItem. This determines whether the tokens are minted/unlocked to the recipient. As
/// such, this must be used as a state machine that moves forward in a linear manner. A state
/// should never "move backward" to a previous state (e.g. should never move from `Released` to
/// `ReleaseAfter`).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq, InitSpace)]
pub enum ReleaseStatus {
    NotApproved,
    ReleaseAfter(i64),
    Released,
}

impl InboxItem {
    pub const SEED_PREFIX: &'static [u8] = b"inbox_item";

    /// Attempt to release the transfer.
    /// Returns true if the transfer was released, false if it was not yet time to release it.
    pub fn try_release(&mut self) -> Result<bool> {
        let now = current_timestamp();

        match self.release_status {
            ReleaseStatus::NotApproved => Ok(false),
            ReleaseStatus::ReleaseAfter(release_timestamp) => {
                if release_timestamp > now {
                    return Ok(false);
                }
                self.release_status = ReleaseStatus::Released;
                Ok(true)
            }
            ReleaseStatus::Released => Err(NTTError::TransferAlreadyRedeemed.into()),
        }
    }

    pub fn release_after(&mut self, release_timestamp: i64) -> Result<()> {
        if self.release_status != ReleaseStatus::NotApproved {
            return Err(NTTError::TransferCannotBeRedeemed.into());
        };
        self.release_status = ReleaseStatus::ReleaseAfter(release_timestamp);
        Ok(())
    }
}

/// Inbound rate limit per chain.
/// SECURITY: must check the PDA (since there are multiple PDAs, namely one for each chain.)
#[account]
#[derive(InitSpace)]
pub struct InboxRateLimit {
    pub bump: u8,
    pub rate_limit: RateLimitState,
}

impl InboxRateLimit {
    pub const SEED_PREFIX: &'static [u8] = b"inbox_rate_limit";
}

impl Deref for InboxRateLimit {
    type Target = RateLimitState;
    fn deref(&self) -> &Self::Target {
        &self.rate_limit
    }
}

impl DerefMut for InboxRateLimit {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.rate_limit
    }
}
