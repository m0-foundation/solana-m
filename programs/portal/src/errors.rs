use anchor_lang::prelude::error_code;

#[error_code]
pub enum PortalError {
    #[msg("Paused")]
    Paused,
    #[msg("InvalidTransceiverPeer")]
    InvalidTransceiverPeer,
    #[msg("InvalidChainId")]
    InvalidChainId,
    #[msg("BitmapIndexOutOfBounds")]
    BitmapIndexOutOfBounds,
}
