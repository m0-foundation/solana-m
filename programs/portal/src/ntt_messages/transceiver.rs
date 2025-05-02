use anchor_lang::prelude::*;
use core::fmt;
use std::{io, marker::PhantomData};
use wormhole_io::{Readable, TypePrefixedPayload, Writeable};

use super::{MaybeSpace, NttManagerMessage};

pub trait Transceiver {
    const PREFIX: [u8; 4];
}

#[derive(Debug, PartialEq, Eq, Clone, AnchorSerialize, AnchorDeserialize, InitSpace)]
pub struct TransceiverMessageData<A: MaybeSpace> {
    pub source_ntt_manager: [u8; 32],
    pub recipient_ntt_manager: [u8; 32],
    pub ntt_manager_payload: NttManagerMessage<A>,
}

/// This struct is for zero-copy deserialization of
/// `ValidatedTransceiverMessage::message()` in the redeem ix
pub struct TransceiverMessageDataBytes<'a, A: MaybeSpace> {
    _phantom: PhantomData<A>,
    span: &'a [u8],
}

impl<A: MaybeSpace> AsRef<[u8]> for TransceiverMessageDataBytes<'_, A> {
    fn as_ref(&self) -> &[u8] {
        self.span
    }
}

impl<'a, A: MaybeSpace> TransceiverMessageDataBytes<'a, A> {
    pub fn source_ntt_manager(&self) -> [u8; 32] {
        self.span[..32].try_into().unwrap()
    }

    pub fn recipient_ntt_manager(&self) -> [u8; 32] {
        self.span[32..64].try_into().unwrap()
    }

    pub fn ntt_manager_payload(&self) -> NttManagerMessage<A>
    where
        A: AnchorDeserialize,
    {
        NttManagerMessage::deserialize(&mut &self.span[64..]).unwrap()
    }

    pub fn parse(span: &'a [u8]) -> TransceiverMessageDataBytes<'a, A> {
        TransceiverMessageDataBytes {
            _phantom: PhantomData,
            span,
        }
    }
}

#[derive(Eq, PartialEq, Clone, Debug)]
pub struct TransceiverMessage<E: Transceiver, A: MaybeSpace> {
    _phantom: PhantomData<E>,
    // TODO: check peer registration at the ntt_manager level
    pub message_data: TransceiverMessageData<A>,
    pub transceiver_payload: Vec<u8>,
}

impl<E: Transceiver, A: MaybeSpace> std::ops::Deref for TransceiverMessage<E, A> {
    type Target = TransceiverMessageData<A>;

    fn deref(&self) -> &Self::Target {
        &self.message_data
    }
}

impl<E: Transceiver, A: MaybeSpace> std::ops::DerefMut for TransceiverMessage<E, A> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.message_data
    }
}

impl<E: Transceiver, A: TypePrefixedPayload> AnchorDeserialize for TransceiverMessage<E, A>
where
    A: MaybeSpace,
{
    fn deserialize_reader<R: io::Read>(reader: &mut R) -> io::Result<Self> {
        Readable::read(reader)
    }
}

impl<E: Transceiver, A: TypePrefixedPayload> AnchorSerialize for TransceiverMessage<E, A>
where
    A: MaybeSpace,
{
    fn serialize<W: io::Write>(&self, writer: &mut W) -> io::Result<()> {
        Writeable::write(self, writer)
    }
}

impl<E: Transceiver, A> TransceiverMessage<E, A>
where
    A: MaybeSpace,
{
    pub fn new(
        source_ntt_manager: [u8; 32],
        recipient_ntt_manager: [u8; 32],
        ntt_manager_payload: NttManagerMessage<A>,
        transceiver_payload: Vec<u8>,
    ) -> Self {
        Self {
            _phantom: PhantomData,
            message_data: TransceiverMessageData {
                source_ntt_manager,
                recipient_ntt_manager,
                ntt_manager_payload,
            },
            transceiver_payload,
        }
    }
}

impl<A: TypePrefixedPayload, E: Transceiver + Clone + fmt::Debug> TypePrefixedPayload
    for TransceiverMessage<E, A>
where
    A: MaybeSpace + Clone,
{
    const TYPE: Option<u8> = None;
}

impl<E: Transceiver, A: TypePrefixedPayload> Readable for TransceiverMessage<E, A>
where
    A: MaybeSpace,
{
    const SIZE: Option<usize> = None;

    fn read<R>(reader: &mut R) -> io::Result<Self>
    where
        Self: Sized,
        R: io::Read,
    {
        let prefix: [u8; 4] = Readable::read(reader)?;
        if prefix != E::PREFIX {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Invalid prefix for TransceiverMessage",
            ));
        }

        let source_ntt_manager = Readable::read(reader)?;
        let recipient_ntt_manager = Readable::read(reader)?;
        // TODO: we need a way to easily check that decoding the payload
        // consumes the expected amount of bytes
        let _ntt_manager_payload_len: u16 = Readable::read(reader)?;
        let ntt_manager_payload = NttManagerMessage::read(reader)?;
        let transceiver_payload_len: u16 = Readable::read(reader)?;
        let mut transceiver_payload = vec![0; transceiver_payload_len as usize];
        reader.read_exact(&mut transceiver_payload)?;

        Ok(TransceiverMessage::new(
            source_ntt_manager,
            recipient_ntt_manager,
            ntt_manager_payload,
            transceiver_payload,
        ))
    }
}

impl<E: Transceiver, A: TypePrefixedPayload> Writeable for TransceiverMessage<E, A>
where
    A: MaybeSpace,
{
    fn written_size(&self) -> usize {
        4 // prefix
        + self.source_ntt_manager.len()
        + u16::SIZE.unwrap() // length prefix
        + self.ntt_manager_payload.written_size()
    }

    fn write<W>(&self, writer: &mut W) -> io::Result<()>
    where
        W: io::Write,
    {
        let TransceiverMessage {
            _phantom,
            message_data:
                TransceiverMessageData {
                    source_ntt_manager,
                    recipient_ntt_manager,
                    ntt_manager_payload,
                },
            transceiver_payload,
        } = self;

        E::PREFIX.write(writer)?;
        source_ntt_manager.write(writer)?;
        recipient_ntt_manager.write(writer)?;
        let len: u16 = u16::try_from(ntt_manager_payload.written_size()).expect("u16 overflow");
        len.write(writer)?;
        // TODO: review this in wormhole-io. The written_size logic is error prone. Instead,
        // a better API would be
        // foo.write_with_prefix_be::<u16>(writer)
        // which writes the length as a big endian u16.
        ntt_manager_payload.write(writer)?;
        let len: u16 = u16::try_from(transceiver_payload.len()).expect("u16 overflow");
        len.write(writer)?;
        writer.write_all(transceiver_payload)?;
        Ok(())
    }
}
