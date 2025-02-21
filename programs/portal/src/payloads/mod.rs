pub mod index_transfer;
pub mod token_transfer;

use anchor_lang::prelude::*;
use ntt_messages::chain_id::ChainId;
use std::io;
use token_transfer::NativeTokenTransfer;
use wormhole_io::{Readable, TypePrefixedPayload, Writeable};

pub use index_transfer::*;

#[derive(Debug, Clone, PartialEq, Eq, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub enum Payload {
    NativeTokenTransfer(NativeTokenTransfer),
    IndexTransfer(IndexTransfer),
}

impl Payload {
    pub fn to_chain(&self) -> ChainId {
        match self {
            Payload::NativeTokenTransfer(ntt) => ntt.to_chain,
            Payload::IndexTransfer(it) => it.to_chain,
        }
    }
}

impl Readable for Payload {
    const SIZE: Option<usize> = None;

    fn read<R>(reader: &mut R) -> io::Result<Self>
    where
        Self: Sized,
        R: io::Read,
    {
        let prefix: [u8; 4] = Readable::read(reader)?;

        match prefix {
            NativeTokenTransfer::PREFIX => Ok(Self::NativeTokenTransfer(Readable::read(reader)?)),
            IndexTransfer::PREFIX => Ok(Self::IndexTransfer(Readable::read(reader)?)),
            _ => Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Invalid payload type prefix",
            )),
        }
    }
}

impl Writeable for Payload {
    fn written_size(&self) -> usize {
        match self {
            Payload::NativeTokenTransfer(ntt) => ntt.written_size(),
            Payload::IndexTransfer(it) => it.written_size(),
        }
    }

    fn write<W>(&self, writer: &mut W) -> io::Result<()>
    where
        W: io::Write,
    {
        match self {
            Payload::NativeTokenTransfer(ntt) => ntt.write(writer),
            Payload::IndexTransfer(it) => it.write(writer),
        }
    }
}

impl TypePrefixedPayload for Payload {
    const TYPE: Option<u8> = None;
}
