// ext_earn/instructions/open/mod.rs

pub mod remove_orphaned_earner;
pub mod unwrap;
pub mod wrap;

pub use remove_orphaned_earner::RemoveOrphanedEarner;
pub(crate) use remove_orphaned_earner::__client_accounts_remove_orphaned_earner;
pub use unwrap::Unwrap;
pub(crate) use unwrap::__client_accounts_unwrap;
pub use wrap::Wrap;
pub(crate) use wrap::__client_accounts_wrap;

cfg_if::cfg_if! {
    if #[cfg(feature = "cpi")] {
        pub(crate) use wrap::__cpi_client_accounts_wrap;
        pub(crate) use unwrap::__cpi_client_accounts_unwrap;
        pub(crate) use remove_orphaned_earner::__cpi_client_accounts_remove_orphaned_earner;
    }
}
