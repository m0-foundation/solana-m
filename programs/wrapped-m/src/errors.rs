// wrapped-m/errors.rs

use anchor_lang::prelude::*;

#[error_code]
pub enum wMError {
    #[msg("Already claimed for user.")]
    AlreadyClaimed,
    #[msg("Invalid signer.")]
    NotAuthorized,
    #[msg("Not enough M.")]
    InsufficientCollateral,
    #[msg("Token account owner is required to be immutable.")]
    ImmutableOwner,
    #[msg("Invalid account provided.")]
    InvalidAccount,
}