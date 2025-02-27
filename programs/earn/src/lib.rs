// earn/lib.rs - top-level program file

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

use instructions::*;
use utils::merkle_proof::ProofElement;

declare_id!("MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c");

#[program]
pub mod earn {
    use super::*;

    // Admin instructions

    pub fn initialize(
        ctx: Context<Initialize>,
        mint: Pubkey,
        earn_authority: Pubkey,
        initial_index: u64,
        claim_cooldown: u64,
    ) -> Result<()> {
        instructions::admin::initialize::handler(
            ctx,
            mint,
            earn_authority,
            initial_index,
            claim_cooldown,
        )
    }

    pub fn set_earn_authority(
        ctx: Context<SetEarnAuthority>,
        new_earn_authority: Pubkey,
    ) -> Result<()> {
        instructions::admin::set_earn_authority::handler(ctx, new_earn_authority)
    }

    // Portal instrutions

    pub fn propagate_index(
        ctx: Context<PropagateIndex>,
        index: u64,
        earner_merkle_root: [u8; 32],
        earn_manager_merkle_root: [u8; 32],
    ) -> Result<()> {
        instructions::portal::propagate_index::handler(
            ctx,
            index,
            earner_merkle_root,
            earn_manager_merkle_root,
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
        proofs: Vec<Vec<ProofElement>>,
        neighbors: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::earn_manager::add_earner::handler(ctx, user, proofs, neighbors)
    }

    pub fn remove_earner(ctx: Context<RemoveEarner>) -> Result<()> {
        instructions::earn_manager::remove_earner::handler(ctx)
    }

    pub fn configure_earn_manager(
        ctx: Context<ConfigureEarnManager>,
        fee_bps: u64,
        proof: Vec<ProofElement>,
    ) -> Result<()> {
        instructions::earn_manager::configure::handler(ctx, fee_bps, proof)
    }

    // Open instructions

    pub fn add_registrar_earner(
        ctx: Context<AddRegistrarEarner>,
        user: Pubkey,
        proof: Vec<ProofElement>,
    ) -> Result<()> {
        instructions::open::add_registrar_earner::handler(ctx, user, proof)
    }

    pub fn remove_registrar_earner(
        ctx: Context<RemoveRegistrarEarner>,
        proofs: Vec<Vec<ProofElement>>,
        neighbors: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::open::remove_registrar_earner::handler(ctx, proofs, neighbors)
    }

    pub fn remove_earn_manager(
        ctx: Context<RemoveEarnManager>,
        earn_manager: Pubkey,
        proofs: Vec<Vec<ProofElement>>,
        neighbors: Vec<[u8; 32]>,
    ) -> Result<()> {
        instructions::open::remove_earn_manager::handler(ctx, earn_manager, proofs, neighbors)
    }

    pub fn remove_orphaned_earner(ctx: Context<RemoveOrphanedEarner>) -> Result<()> {
        instructions::open::remove_orphaned_earner::handler(ctx)
    }
}
