// earn/instructions/admin/mod.rs

pub mod initialize;
pub mod set_claim_cooldown;
pub mod set_earn_authority;
pub mod set_earner_recipient;

pub use initialize::Initialize;
pub(crate) use initialize::__client_accounts_initialize;
pub use set_claim_cooldown::SetClaimCooldown;
pub(crate) use set_claim_cooldown::__client_accounts_set_claim_cooldown;
pub use set_earn_authority::SetEarnAuthority;
pub(crate) use set_earn_authority::__client_accounts_set_earn_authority;
pub use set_earner_recipient::SetEarnerRecipient;
pub(crate) use set_earner_recipient::__client_accounts_set_earner_recipient;

cfg_if::cfg_if! {
    if #[cfg(feature = "cpi")] {
        pub(crate) use initialize::__cpi_client_accounts_initialize;
        pub(crate) use set_earn_authority::__cpi_client_accounts_set_earn_authority;
        pub(crate) use set_earner_recipient::__cpi_client_accounts_set_earner_recipient;
        pub(crate) use set_claim_cooldown::__cpi_client_accounts_set_claim_cooldown;
    }
}
