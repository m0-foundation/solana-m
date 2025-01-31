use anchor_lang::prelude::*;

#[error_code]
pub enum EarnError {
    #[msg("Already claimed for user.")]
    AlreadyClaimed,
    #[msg("Rewards exceed max yield.")]
    ExceedsMaxYield,
    #[msg("Invalid signer.")]
    NotAuthorized,
}
