// earn/instructions/open/remove_earn_manager.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use registrar::{
    constants::EARN_MANAGER_LIST,
    views::is_in_list,
};

#[derive(Accounts)]
#[instruction(earn_manager: Pubkey)]
pub struct RemoveEarnManager<'info> {
    pub signer: Signer<'info>,

    #[account(
        mut,
        close = signer,
        seeds = [EARN_MANAGER_LIST, earn_manager.as_ref()],
        bump
    )]
    pub earn_manager_account: Account<'info, EarnManager>,

    /// CHECK: we validate this account within the instruction
    /// since we expect it to be an externally owned PDA
    pub registrar_flag: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<RemoveEarnManager>, earn_manager: Pubkey, flag_bump: u8) -> Result<()> {
    // Check if the earn_manager is still on the earn_manager's list
    // If so or if the check fails, return an error
    if is_in_list(
        REGISTRAR,
        &ctx.accounts.registrar_flag.to_account_info(),
        flag_bump,
        &EARN_MANAGER_LIST,
        &earn_manager,
    )? {
        return err!(EarnError::NotAuthorized);
    }

    // TODO what happens to the earners that the earn_manager was managing?
    // We can't iterate through them here. We could allow an open "remove_orphaned_earner"
    // function to remove them, and check that the earn_manager is not the zero
    // address but that the earn_manager's account on this program is closed.

    Ok(())
}