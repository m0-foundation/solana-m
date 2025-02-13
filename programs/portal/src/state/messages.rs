use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::Discriminator;
use ntt_messages::{
    chain_id::ChainId,
    transceiver::{TransceiverMessageData, TransceiverMessageDataBytes},
};

#[account]
#[derive(InitSpace)]
pub struct ValidatedTransceiverMessage<A: AnchorDeserialize + AnchorSerialize + Space + Clone> {
    pub from_chain: ChainId,
    pub message: TransceiverMessageData<A>,
}

impl<A: AnchorDeserialize + AnchorSerialize + Space + Clone> ValidatedTransceiverMessage<A> {
    pub const SEED_PREFIX: &'static [u8] = b"transceiver_message";

    pub fn from_chain(info: &UncheckedAccount) -> Result<ChainId> {
        let data: &[u8] = &info.try_borrow_data().unwrap();
        Self::discriminator_check(data)?;
        Ok(ChainId {
            id: u16::from_le_bytes(data[8..10].try_into().unwrap()),
        })
    }

    pub fn message(data: &[u8]) -> Result<TransceiverMessageDataBytes<A>> {
        Self::discriminator_check(data)?;
        Ok(TransceiverMessageDataBytes::parse(&data[10..]))
    }

    pub fn try_from(info: &UncheckedAccount, expected_owner: &Pubkey) -> Result<Self> {
        if info.owner == &system_program::ID && info.lamports() == 0 {
            return Err(ErrorCode::AccountNotInitialized.into());
        }
        if *info.owner != *expected_owner {
            return Err(Error::from(ErrorCode::AccountOwnedByWrongProgram)
                .with_pubkeys((*info.owner, *expected_owner)));
        }
        let mut data: &[u8] = &info.try_borrow_data()?;
        ValidatedTransceiverMessage::try_deserialize(&mut data)
    }

    fn discriminator_check(data: &[u8]) -> Result<()> {
        if data.len() < Self::DISCRIMINATOR.len() {
            return Err(ErrorCode::AccountDiscriminatorNotFound.into());
        }
        let given_disc = &data[..8];
        if Self::DISCRIMINATOR != given_disc {
            return Err(ErrorCode::AccountDiscriminatorMismatch.into());
        }
        Ok(())
    }
}
