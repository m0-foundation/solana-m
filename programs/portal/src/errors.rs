use anchor_lang::prelude::error_code;
use ntt_messages::errors::ScalingError;

#[error_code]
pub enum PortalError {
    #[msg("BadAmountAfterBurn")]
    BadAmountAfterBurn,
    #[msg("BitmapIndexOutOfBounds")]
    BitmapIndexOutOfBounds,
    #[msg("CantReleaseYet")]
    CantReleaseYet,
    #[msg("DisabledTransceiver")]
    DisabledTransceiver,
    #[msg("InvalidChainId")]
    InvalidChainId,
    #[msg("InvalidMode")]
    InvalidMode,
    #[msg("InvalidMultisig")]
    InvalidMultisig,
    #[msg("InvalidNttManagerPeer")]
    InvalidNttManagerPeer,
    #[msg("InvalidRecipientAddress")]
    InvalidRecipientAddress,
    #[msg("InvalidRecipientNttManager")]
    InvalidRecipientNttManager,
    #[msg("InvalidTransceiverPeer")]
    InvalidTransceiverPeer,
    #[msg("MessageAlreadySent")]
    MessageAlreadySent,
    #[msg("NoRegisteredTransceivers")]
    NoRegisteredTransceivers,
    #[msg("OverflowExponent")]
    OverflowExponent,
    #[msg("OverflowScaledAmount")]
    OverflowScaledAmount,
    #[msg("Paused")]
    Paused,
    #[msg("TransferAlreadyRedeemed")]
    TransferAlreadyRedeemed,
    #[msg("TransferCannotBeRedeemed")]
    TransferCannotBeRedeemed,
    #[msg("TransferExceedsRateLimit")]
    TransferExceedsRateLimit,
    #[msg("ZeroThreshold")]
    ZeroThreshold,
}

impl From<ScalingError> for PortalError {
    fn from(e: ScalingError) -> Self {
        match e {
            ScalingError::OverflowScaledAmount => PortalError::OverflowScaledAmount,
            ScalingError::OverflowExponent => PortalError::OverflowExponent,
        }
    }
}
