// earn/instructions/open/mod.rs

pub mod add_registrar_earner;
pub mod remove_earn_manager;
pub mod remove_orphaned_earner;
pub mod remove_registrar_earner;

pub use add_registrar_earner::AddRegistrarEarner;
pub(crate) use add_registrar_earner::__client_accounts_add_registrar_earner;
pub use remove_earn_manager::RemoveEarnManager;
pub(crate) use remove_earn_manager::__client_accounts_remove_earn_manager;
pub use remove_orphaned_earner::RemoveOrphanedEarner;
pub(crate) use remove_orphaned_earner::__client_accounts_remove_orphaned_earner;
pub use remove_registrar_earner::RemoveRegistrarEarner;
pub(crate) use remove_registrar_earner::__client_accounts_remove_registrar_earner;

cfg_if::cfg_if! {
    if #[cfg(feature = "cpi")] {
        pub(crate) use add_registrar_earner::__cpi_client_accounts_add_registrar_earner;
        pub(crate) use remove_earn_manager::__cpi_client_accounts_remove_earn_manager;
        pub(crate) use remove_orphaned_earner::__cpi_client_accounts_remove_orphaned_earner;
        pub(crate) use remove_registrar_earner::__cpi_client_accounts_remove_registrar_earner;
    }
}
