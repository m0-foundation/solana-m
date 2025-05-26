use anchor_lang::prelude::*;

#[error_code]
pub enum SwapError {
    #[msg("Swap pool requires an oracle")]
    MissingOracle,
    #[msg("Bad oracle data")]
    BadOracleData,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Account does not match provided mint")]
    InvalidAccountForMint,
}
