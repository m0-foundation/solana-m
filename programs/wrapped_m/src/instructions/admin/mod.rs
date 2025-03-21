// wrapped-m/instructions/admin/mod.rs

pub mod add_earner;
pub mod initialize;
pub mod remove_earner;
pub mod set_earn_authority;

pub use add_earner::AddEarner;
pub(crate) use add_earner::__client_accounts_add_earner;
pub use initialize::Initialize;
pub(crate) use initialize::__client_accounts_initialize;
pub use remove_earner::RemoveEarner;
pub(crate) use remove_earner::__client_accounts_remove_earner;
pub use set_earn_authority::SetEarnAuthority;
pub(crate) use set_earn_authority::__client_accounts_set_earn_authority;

cfg_if::cfg_if! {
    if #[cfg(feature = "cpi")] {
        pub(crate) use add_earner::__cpi_client_accounts_add_earner;
        pub(crate) use initialize::__cpi_client_accounts_initialize;
        pub(crate) use remove_earner::__cpi_client_accounts_remove_earner;
        pub(crate) use set_earn_authority::__cpi_client_accounts_set_earn_authority;
    }
}