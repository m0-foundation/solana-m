// registrar/errors.rs

use anchor_lang::prelude::*;

#[error_code]
pub enum RegistrarError {
    #[msg("The provided PDA does not match the calculated PDA address")]
    InvalidPDA,
    #[msg("The provided PDA is not initialized.")]
    NotInitialized,
    #[msg("Address is already a member of the list")]
    AlreadyInList,
}