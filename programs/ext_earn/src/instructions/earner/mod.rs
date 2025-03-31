// ext_earn/instructions/earner/mod.rs

pub mod set_recipient;

pub use set_recipient::SetRecipient;
pub(crate) use set_recipient::__client_accounts_set_recipient;

cfg_if::cfg_if! {
    if #[cfg(feature = "cpi")] {
        pub(crate) use set_recipient::__cpi_client_accounts_set_recipient;
    }
}