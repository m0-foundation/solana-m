// ext_earn/instructions/admin/mod.rs

pub mod add_earn_manager;
pub mod initialize;
pub mod remove_earn_manager;
pub mod remove_orphaned_earner;
pub mod set_earn_authority;

pub use add_earn_manager::AddEarnManager;
pub(crate) use add_earn_manager::__client_accounts_add_earn_manager;
pub use initialize::Initialize;
pub(crate) use initialize::__client_accounts_initialize;
pub use remove_earn_manager::RemoveEarnManager;
pub(crate) use remove_earn_manager::__client_accounts_remove_earn_manager;
pub use remove_orphaned_earner::RemoveOrphanedEarner;
pub(crate) use remove_orphaned_earner::__client_accounts_remove_orphaned_earner;
pub use set_earn_authority::SetEarnAuthority;
pub(crate) use set_earn_authority::__client_accounts_set_earn_authority;

cfg_if::cfg_if! {
    if #[cfg(feature = "cpi")] {
        pub(crate) use add_earn_manager::__cpi_client_accounts_add_earn_manager;
        pub(crate) use initialize::__cpi_client_accounts_initialize;
        pub(crate) use remove_earn_manager::__cpi_client_accounts_remove_earn_manager;
        pub(crate) use remove_orphaned_earner::__cpi_client_accounts_remove_orphaned_earner;
        pub(crate) use set_earn_authority::__cpi_client_accounts_set_earn_authority;
    }
}
