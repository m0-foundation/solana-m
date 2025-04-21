// earn/instructions/admin/set_earn_authority.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use super::AdminAction;

pub fn handler(ctx: Context<AdminAction>, new_earn_authority: Pubkey) -> Result<()> {
    ctx.accounts.global_account.earn_authority = new_earn_authority;

    Ok(())
}
