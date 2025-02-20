use anchor_lang::prelude::*;
use ntt_messages::trimmed_amount::TrimmedAmount;
use std::io;
use wormhole_io::{Readable, Writeable};

#[derive(Debug, Clone, PartialEq, Eq, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub struct IndexTransfer {
    pub index: u128,
}

impl IndexTransfer {
    pub const PREFIX: [u8; 4] = [0x4D, 0x30, 0x49, 0x54];
}

impl Readable for IndexTransfer {
    const SIZE: Option<usize> = None;

    fn read<R>(reader: &mut R) -> io::Result<Self>
    where
        Self: Sized,
        R: io::Read,
    {
        let prefix: [u8; 4] = Readable::read(reader)?;
        if prefix != Self::PREFIX {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Invalid prefix for NativeTokenTransfer",
            ));
        }

        let index = Readable::read(reader)?;

        Ok(Self { index })
    }
}

impl Writeable for IndexTransfer {
    fn written_size(&self) -> usize {
        Self::PREFIX.len() + TrimmedAmount::SIZE.unwrap()
    }

    fn write<W>(&self, writer: &mut W) -> io::Result<()>
    where
        W: io::Write,
    {
        Self::PREFIX.write(writer)?;
        self.index.write(writer)?;

        Ok(())
    }
}
