// earn/instructions/admin/mod.rs

use anchor_lang::prelude::*;

pub mod initialize;
pub mod set_claim_cooldown;
pub mod set_earn_authority;

pub use initialize::Initialize;
pub(crate) use initialize::__client_accounts_initialize;
pub use set_claim_cooldown::SetClaimCooldown;
pub(crate) use set_claim_cooldown::__client_accounts_set_claim_cooldown;
pub use set_earn_authority::SetEarnAuthority;
pub(crate) use set_earn_authority::__client_accounts_set_earn_authority;

use crate::{
    errors::EarnError,
    state::{Global, GLOBAL_SEED},
};

cfg_if::cfg_if! {
    if #[cfg(feature = "cpi")] {
        pub(crate) use initialize::__cpi_client_accounts_initialize;
    }
}

#[derive(Accounts)]
pub struct AdminAction<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_SEED],
        has_one = admin @ EarnError::NotAuthorized,
        bump = global_account.bump,
    )]
    pub global_account: Account<'info, Global>,
}
