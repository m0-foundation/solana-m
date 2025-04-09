// no_earn/instructions/admin/mod.rs

pub mod claim_excess;
pub mod initialize;
pub mod set_m_mint;
pub mod set_wrap_authority;

pub use claim_excess::ClaimExcess;
pub(crate) use claim_excess::__client_accounts_claim_excess;
pub use initialize::Initialize;
pub(crate) use initialize::__client_accounts_initialize;
pub use set_m_mint::SetMMint;
pub(crate) use set_m_mint::__client_accounts_set_m_mint;
pub use set_wrap_authority::SetWrapAuthority;
pub(crate) use set_wrap_authority::__client_accounts_set_wrap_authority;

cfg_if::cfg_if! {
    if #[cfg(feature = "cpi")] {
        pub(crate) use claim_excess::__cpi_client_accounts_claim_excess;
        pub(crate) use initialize::__cpi_client_accounts_initialize;
        pub(crate) use set_m_mint::__cpi_client_accounts_set_m_mint;
        pub(crate) use set_wrap_authority::__cpi_client_accounts_set_wrap_authority;
    }
}
