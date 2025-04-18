use anchor_lang::prelude::*;

#[error_code]
pub enum ExtError {
    #[msg("Already claimed for user.")]
    AlreadyClaimed,
    #[msg("Invalid signer.")]
    NotAuthorized,
    #[msg("Invalid parameter.")]
    InvalidParam,
    #[msg("Account does not match the expected key.")]
    InvalidAccount,
    #[msg("Account is currently active.")]
    Active,
    #[msg("Account is not currently active.")]
    NotActive,
    #[msg("Token account owner is required to be immutable.")]
    MutableOwner,
    #[msg("Not enough M.")]
    InsufficientCollateral,
    #[msg("Invalid Mint.")]
    InvalidMint,
}
