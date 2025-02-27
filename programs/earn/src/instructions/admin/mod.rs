// earn/instructions/admin/mod.rs

pub mod initialize;
pub mod set_earn_authority;

pub use initialize::Initialize;
pub(crate) use initialize::__client_accounts_initialize;
pub use set_earn_authority::SetEarnAuthority;
pub(crate) use set_earn_authority::__client_accounts_set_earn_authority;

cfg_if::cfg_if! {
    if #[cfg(feature = "cpi")] {
        pub(crate) use initialize::__cpi_client_accounts_initialize;
        pub(crate) use set_earn_authority::__cpi_client_accounts_set_earn_authority;
    }
}
