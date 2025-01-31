// registrar/lib.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
pub mod constants;
pub mod errors;
mod instructions;
pub mod state;
mod utils;
pub mod views;

use instructions::*;

// program
declare_id!("DJ3kM7oLuua6NZjnYgCA8SMFhYc1MJMAZ21HmP52ugD1");

#[program]
pub mod registrar {
    use super::*;

    // Admin functions
    
    pub fn set_key(ctx: Context<SetKey>, key: [u8; 32], value: [u8; 32]) -> Result<()> {
        instructions::admin::set_key::handler(ctx, key, value)
    }

    pub fn delete_key(ctx: Context<DeleteKey>, key: [u8; 32]) -> Result<()> {
        instructions::admin::delete_key::handler(ctx, key)
    }

    pub fn add_to_list(ctx: Context<AddToList>, list: [u8; 32], address: Pubkey) -> Result<()> {
        instructions::admin::add_to_list::handler(ctx, list, address)
    }

    pub fn remove_from_list(ctx: Context<RemoveFromList>, list: [u8;32], address: Pubkey) -> Result<()> {
        instructions::admin::remove_from_list::handler(ctx, list, address)
    } 
}