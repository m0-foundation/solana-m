// wrapped-m/utils/earn_global.rs

use anchor_lang::prelude::*;
use earn::state::Global as EarnGlobal;

pub fn load_earn_global_data(earn_global_account: &AccountInfo) -> Result<EarnGlobal> {
    Ok(EarnGlobal::try_from_slice(&earn_global_account.data.borrow())?)
}