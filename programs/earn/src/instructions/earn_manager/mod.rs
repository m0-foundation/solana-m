// earn/instructions/earn_manager/mod.rs

pub mod add_earner;
pub mod configure;
pub mod remove_earner;

pub use add_earner::AddEarner;
pub(crate) use add_earner::__client_accounts_add_earner;
pub(crate) use add_earner::__cpi_client_accounts_add_earner;
pub use configure::ConfigureEarnManager;
pub(crate) use configure::__client_accounts_configure_earn_manager;
pub(crate) use configure::__cpi_client_accounts_configure_earn_manager;
pub use remove_earner::RemoveEarner;
pub(crate) use remove_earner::__client_accounts_remove_earner;
pub(crate) use remove_earner::__cpi_client_accounts_remove_earner;
