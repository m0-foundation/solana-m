use anchor_lang::prelude::*;
use ntt_messages::{chain_id::ChainId, trimmed_amount::TrimmedAmount};
use std::io;

use wormhole_io::{Readable, TypePrefixedPayload, Writeable};

#[derive(Debug, Clone, PartialEq, Eq, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub struct NativeTokenTransfer {
    pub amount: TrimmedAmount,
    pub source_token: [u8; 32],
    pub to: [u8; 32],
    pub to_chain: ChainId,
    pub additional_payload: AdditionalPayload,
}

impl NativeTokenTransfer {
    pub const PREFIX: [u8; 4] = [0x99, 0x4E, 0x54, 0x54];
}

impl TypePrefixedPayload for NativeTokenTransfer {
    const TYPE: Option<u8> = None;
}

impl Readable for NativeTokenTransfer {
    const SIZE: Option<usize> = None;

    fn read<R>(reader: &mut R) -> io::Result<Self>
    where
        Self: Sized,
        R: io::Read,
    {
        let amount = Readable::read(reader)?;
        let source_token = Readable::read(reader)?;
        let to = Readable::read(reader)?;
        let to_chain = Readable::read(reader)?;

        // additional payload
        let mut additional_payload = AdditionalPayload::default();
        let payload_len: u16 = Readable::read(reader)?;
        msg!("additional payload length: {}", payload_len);

        if payload_len >= 48 {
            additional_payload.index = Some(Readable::read(reader)?);
            additional_payload.destination = Some(Readable::read(reader)?);
        }
        if payload_len >= 112 {
            additional_payload.earner_root = Some(Readable::read(reader)?);
            additional_payload.earn_manager_root = Some(Readable::read(reader)?);
        }

        Ok(Self {
            amount,
            source_token,
            to,
            to_chain,
            additional_payload,
        })
    }
}

impl Writeable for NativeTokenTransfer {
    fn written_size(&self) -> usize {
        Self::PREFIX.len()
            + TrimmedAmount::SIZE.unwrap()
            + self.source_token.len()
            + self.to.len()
            + ChainId::SIZE.unwrap()
            + u16::SIZE.unwrap()
            + self.additional_payload.written_size()
    }

    fn write<W>(&self, writer: &mut W) -> io::Result<()>
    where
        W: io::Write,
    {
        let NativeTokenTransfer {
            amount,
            source_token,
            to,
            to_chain,
            additional_payload,
        } = self;

        Self::PREFIX.write(writer)?;
        amount.write(writer)?;
        source_token.write(writer)?;
        to.write(writer)?;
        to_chain.write(writer)?;

        let len: u16 = u16::try_from(additional_payload.written_size()).expect("u16 overflow");
        len.write(writer)?;
        additional_payload.write(writer)?;

        Ok(())
    }
}

#[derive(Debug, PartialEq, Eq, Default, Clone, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub struct AdditionalPayload {
    pub index: Option<u128>,
    pub destination: Option<[u8; 32]>,
    pub earner_root: Option<[u8; 32]>,
    pub earn_manager_root: Option<[u8; 32]>,
}

impl Writeable for AdditionalPayload {
    fn written_size(&self) -> usize {
        let mut size = 0;
        if self.index.is_some() && self.destination.is_some() {
            size += u128::SIZE.unwrap() + self.destination.unwrap().len();
        }
        if self.earner_root.is_some() && self.earn_manager_root.is_some() {
            size += self.earner_root.unwrap().len() + self.earn_manager_root.unwrap().len();
        }
        size
    }

    fn write<W>(&self, writer: &mut W) -> io::Result<()>
    where
        W: io::Write,
    {
        if self.index.is_some() && self.destination.is_some() {
            self.index.unwrap().write(writer)?;
            self.destination.unwrap().write(writer)?;
        }
        if self.earner_root.is_some() && self.earn_manager_root.is_some() {
            self.earner_root.unwrap().write(writer)?;
            self.earn_manager_root.unwrap().write(writer)?;
        }
        Ok(())
    }
}
