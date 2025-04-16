// Extension Interface - common interface to interact with M0 extensions

use anchor_lang::prelude::*;

// Expand with additional extension program IDs
static IDS: [Pubkey; 1] = [ext_earn::ID];

use std::ops::Deref;

pub use ext_earn::state::{EXT_GLOBAL_SEED, MINT_AUTHORITY_SEED, M_VAULT_SEED};

#[derive(Clone)]
pub struct ExtensionInterface;

impl anchor_lang::Ids for ExtensionInterface {
    fn ids() -> &'static [Pubkey] {
        &IDS
    }
}

#[derive(Clone)]
pub struct ExtGlobal(ext_earn::state::ExtGlobal);

impl anchor_lang::AccountDeserialize for ExtGlobal {
    fn try_deserialize_unchecked(buf: &mut &[u8]) -> anchor_lang::Result<Self> {
        let ext_global = ext_earn::state::ExtGlobal::try_deserialize(buf)?;
        Ok(ExtGlobal(ext_global))
    }
}

impl anchor_lang::AccountSerialize for ExtGlobal {}

impl anchor_lang::Owners for ExtGlobal {
    fn owners() -> &'static [Pubkey] {
        &IDS
    }
}

impl Deref for ExtGlobal {
    type Target = ext_earn::state::ExtGlobal;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

// CPI functions

pub use ext_earn::cpi::{
    accounts::{Unwrap, Wrap},
    unwrap, wrap,
};
