use anchor_lang::prelude::*;

#[error_code]
pub enum EarnError {
    #[msg("Already claimed for user.")]
    AlreadyClaimed,
    #[msg("Rewards exceed max yield.")]
    ExceedsMaxYield,
    #[msg("Invalid signer.")]
    NotAuthorized,
    #[msg("Invalid parameter.")]
    InvalidParam,
    #[msg("User is already an earner.")]
    AlreadyEarns,
    #[msg("There is no active claim to complete.")]
    NoActiveClaim,
    #[msg("User is not earning.")]
    NotEarning,
}
