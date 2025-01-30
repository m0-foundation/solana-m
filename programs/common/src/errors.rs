// common/errors.rs

// external dependencies
use anchor_lang::prelude::*;

#[error_code]
pub enum MError {
    #[msg("An optional account is required in this case")]
    AccountMissing,
    #[msg("The program is already initialized")]
    AlreadyInitialized,
    #[msg("Invalid user earning account")]
    InvalidUserEarningAccount,
    #[msg("User balance invariant violated")]
    InvalidBalance,
    #[msg("Invalid Parameter")]
    InvalidParam,
    #[msg("Signer is not authorized")]
    Unauthorized,
}