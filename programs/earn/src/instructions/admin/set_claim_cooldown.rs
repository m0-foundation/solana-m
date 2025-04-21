// earn/instructions/admin/set_claim_cooldown.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use super::AdminAction;
use crate::errors::EarnError;

pub fn handler(ctx: Context<AdminAction>, claim_cooldown: u64) -> Result<()> {
    // Do not allow a cooldown longer than 1 week
    if claim_cooldown > 604800 {
        return err!(EarnError::InvalidParam);
    }

    ctx.accounts.global_account.claim_cooldown = claim_cooldown;

    Ok(())
}
