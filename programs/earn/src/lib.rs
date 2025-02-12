// earn/lib.rs - top-level program file

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

pub use constants::*;
pub use errors::*;
pub use instructions::*;
pub use state::*;

declare_id!("Ea18o3BKAQD8p3DTZ1mabgJiRM7XkoYtmh9TWgxFv6gh");

#[program]
pub mod earn {
    use super::*;

    // Admin instructions

    pub fn initialize(
        ctx: Context<Initialize>,
        earn_authority: Pubkey, 
        initial_index: u64,
        claim_cooldown: u64,
    ) -> Result<()> {
        instructions::admin::initialize::handler(
            ctx, 
            earn_authority, 
            initial_index, 
            claim_cooldown,
        )
    }

    pub fn set_earn_authority(ctx: Context<SetEarnAuthority>, new_earn_authority: Pubkey) -> Result<()> {
        instructions::admin::set_earn_authority::handler(ctx, new_earn_authority)
    }

    // Portal instrutions

    pub fn propagate_index(
        ctx: Context<PropagateIndex>, 
        index: u64,
        earner_merkle_root: [u8; 32],
        earn_manager_merkle_root: [u8; 32]
    ) -> Result<()> {
        instructions::portal::propagate_index::handler(
            ctx, 
            index,
            earner_merkle_root,
            earn_manager_merkle_root
        )
    }

    // Earn authority instructions

    pub fn claim_for(ctx: Context<ClaimFor>, snapshot_balance: u64) -> Result<()> {
        instructions::earn_authority::claim_for::handler(ctx, snapshot_balance)
    }

    pub fn complete_claims(ctx: Context<CompleteClaims>) -> Result<()> {
        instructions::earn_authority::complete_claims::handler(ctx)
    }

    // Earn manager instructions

    pub fn add_earner(
        ctx: Context<AddEarner>, 
        user: Pubkey, 
        proof: Vec<[u8; 32]>,
        sibling: [u8; 32]
    ) -> Result<()> {
        instructions::earn_manager::add_earner::handler(ctx, user, proof, sibling)
    }

    pub fn remove_earner(ctx: Context<RemoveEarner>, user: Pubkey) -> Result<()> {
        instructions::earn_manager::remove_earner::handler(ctx, user)
    }

    pub fn configure_earn_manager(
        ctx: Context<ConfigureEarnManager>, 
        fee_percent: u64,
        proof: Vec<[u8; 32]>
    ) -> Result<()> {
        instructions::earn_manager::configure::handler(ctx, fee_percent, proof)
    }

    // Open instructions

    pub fn add_registrar_earner(
        ctx: Context<AddRegistrarEarner>, 
        user: Pubkey, 
        proof: Vec<[u8; 32]>
    ) -> Result<()> {
        instructions::open::add_registrar_earner::handler(ctx, user, proof)
    }

    pub fn remove_registrar_earner(ctx: Context<RemoveRegistrarEarner>, user: Pubkey, proof: Vec<[u8; 32]>, sibling: [u8; 32]) -> Result<()> {
        instructions::open::remove_registrar_earner::handler(ctx, user, proof, sibling)
    }

    pub fn remove_earn_manager(ctx: Context<RemoveEarnManager>, earn_manager: Pubkey, proof: Vec<[u8; 32]>, sibling: [u8; 32]) -> Result<()> {
        instructions::open::remove_earn_manager::handler(ctx, earn_manager, proof, sibling)
    }

}
