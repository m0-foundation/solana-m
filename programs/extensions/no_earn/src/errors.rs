use anchor_lang::prelude::*;

#[error_code]
pub enum ExtError {
    #[msg("Invalid signer.")]
    NotAuthorized,
    #[msg("Invalid parameter.")]
    InvalidParam,
    #[msg("Account does not match the expected key.")]
    InvalidAccount,
    #[msg("Not enough M.")]
    InsufficientCollateral,
}
