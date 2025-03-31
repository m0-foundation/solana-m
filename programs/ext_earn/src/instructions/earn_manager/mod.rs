// ext_earn/instructions/earn_manager/mod.rs

pub mod add_earner;
pub mod configure;
pub mod remove_earner;
pub mod transfer_earner;

pub use add_earner::AddEarner;
pub(crate) use add_earner::__client_accounts_add_earner;
pub use configure::ConfigureEarnManager;
pub(crate) use configure::__client_accounts_configure_earn_manager;
pub use remove_earner::RemoveEarner;
pub(crate) use remove_earner::__client_accounts_remove_earner;
pub use transfer_earner::TransferEarner;
pub(crate) use transfer_earner::__client_accounts_transfer_earner;

cfg_if::cfg_if! {
    if #[cfg(feature = "cpi")] {
        pub(crate) use add_earner::__cpi_client_accounts_add_earner;
        pub(crate) use configure::__cpi_client_accounts_configure_earn_manager;
        pub(crate) use remove_earner::__cpi_client_accounts_remove_earner;
        pub(crate) use transfer_earner::__cpi_client_accounts_transfer_earner;
    }
}
