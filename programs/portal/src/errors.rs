use anchor_lang::prelude::error_code;
use ntt_messages::errors::ScalingError;

#[error_code]
pub enum PortalError {
    #[msg("CantReleaseYet")]
    CantReleaseYet,
    #[msg("TransferAlreadyRedeemed")]
    TransferAlreadyRedeemed,
    #[msg("Paused")]
    Paused,
    #[msg("InvalidTransceiverPeer")]
    InvalidTransceiverPeer,
    #[msg("InvalidChainId")]
    InvalidChainId,
    #[msg("InvalidRecipientAddress")]
    InvalidRecipientAddress,
    #[msg("InvalidNttManagerPeer")]
    InvalidNttManagerPeer,
    #[msg("InvalidMode")]
    InvalidMode,
    #[msg("InvalidMultisig")]
    InvalidMultisig,
    #[msg("TransferCannotBeRedeemed")]
    TransferCannotBeRedeemed,
    #[msg("BitmapIndexOutOfBounds")]
    BitmapIndexOutOfBounds,
    #[msg("ZeroThreshold")]
    ZeroThreshold,
    #[msg("DisabledTransceiver")]
    DisabledTransceiver,
    #[msg("InvalidRecipientNttManager")]
    InvalidRecipientNttManager,
    #[msg("OverflowExponent")]
    OverflowExponent,
    #[msg("OverflowScaledAmount")]
    OverflowScaledAmount,
}

impl From<ScalingError> for PortalError {
    fn from(e: ScalingError) -> Self {
        match e {
            ScalingError::OverflowScaledAmount => PortalError::OverflowScaledAmount,
            ScalingError::OverflowExponent => PortalError::OverflowExponent,
        }
    }
}
