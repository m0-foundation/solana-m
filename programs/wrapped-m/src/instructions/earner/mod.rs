// wrapped-m/instructions/earner/mod.rs

pub mod set_yield_recipient;

pub use set_yield_recipient::SetYieldRecipient;
pub(crate) use set_yield_recipient::__client_accounts_set_yield_recipient;

cfg_if::cfg_if! {
    if #[cfg(feature = "cpi")] {
        pub(crate) use set_yield_recipient::__cpi_client_accounts_set_yield_recipient;
    }
}