// earn/instructions/earn_authority/mod.rs

pub mod claim_for;
pub mod complete_claims;

pub use claim_for::ClaimFor;
pub(crate) use claim_for::__client_accounts_claim_for;
pub use complete_claims::CompleteClaims;
pub(crate) use complete_claims::__client_accounts_complete_claims;

cfg_if::cfg_if! {
    if #[cfg(feature = "cpi")] {
        pub(crate) use claim_for::__cpi_client_accounts_claim_for;
        pub(crate) use complete_claims::__cpi_client_accounts_complete_claims;
    }
}
