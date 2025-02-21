use anchor_lang::prelude::*;
use ntt_messages::{chain_id::ChainId, ntt::EmptyPayload, trimmed_amount::TrimmedAmount};
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
        let additional_payload = Readable::read(reader)?;

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
        additional_payload.write(writer)?;

        Ok(())
    }
}

#[derive(Debug, PartialEq, Eq, Clone, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub enum AdditionalPayload {
    Empty(EmptyPayload),
    IndexUpdate(IndexUpdate),
}

impl Readable for AdditionalPayload {
    const SIZE: Option<usize> = None;

    fn read<R>(reader: &mut R) -> io::Result<Self>
    where
        Self: Sized,
        R: io::Read,
    {
        Ok(Self::Empty(EmptyPayload {}))
    }
}

impl Writeable for AdditionalPayload {
    fn written_size(&self) -> usize {
        0
    }

    fn write<W>(&self, writer: &mut W) -> io::Result<()>
    where
        W: io::Write,
    {
        Ok(())
    }
}

#[derive(Debug, PartialEq, Eq, Default, Clone, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub struct IndexUpdate {
    pub index: u128,
    pub destination: [u8; 32],
}

impl Readable for IndexUpdate {
    const SIZE: Option<usize> = None;

    fn read<R>(reader: &mut R) -> io::Result<Self>
    where
        Self: Sized,
        R: io::Read,
    {
        let index = Readable::read(reader)?;
        let destination = Readable::read(reader)?;
        Ok(Self { index, destination })
    }
}

impl Writeable for IndexUpdate {
    fn written_size(&self) -> usize {
        u128::SIZE.unwrap() + self.destination.len()
    }

    fn write<W>(&self, writer: &mut W) -> io::Result<()>
    where
        W: io::Write,
    {
        self.index.write(writer)?;
        self.destination.write(writer)?;
        Ok(())
    }
}
