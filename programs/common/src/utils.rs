// common/utils.rs

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked,
    Burn, 
    burn, 
    Mint, 
    MintTo, 
    mint_to, 
    TokenAccount, 
    TokenInterface, 
    TransferChecked
};
use solana_program;

// local dependencies
// use crate::constants::ONE;

// This file contains general helper functions used throughout the program

// pub fn get_principal_rounded_down(amount: u64, index: u64) -> u64 {
//     amount * ONE / index
// }

// pub fn get_principal_rounded_up(amount: u64, index: u64) -> u64 {
//     (amount * ONE + index - 1) / index
// }

// pub fn get_amount_rounded_down(principal: u64, index: u64) -> u64 {
//     principal * index / ONE
// }

// pub fn get_amount_rounded_up(principal: u64, index: u64) -> u64 {
//     (principal * index + ONE - 1) / ONE
// }

pub fn transfer_tokens_from_program<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    amount: &u64,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    authority_seeds: &[&[&[u8]]],
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    // Build the arguments for the transfer instruction
    let transfer_options = TransferChecked {
        from: from.to_account_info(),
        to: to.to_account_info(),
        mint: mint.to_account_info(),
        authority: authority.clone(),
    };
    let cpi_context = CpiContext::new_with_signer(token_program.to_account_info(), transfer_options, authority_seeds);

    // Call the transfer instruction
    transfer_checked(
        cpi_context,
        *amount,
        mint.decimals,
    )?;

    Ok(())
}

pub fn transfer_tokens<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    amount: &u64,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    // Build the arguments for the transfer instruction
    let transfer_options = TransferChecked {
        from: from.to_account_info(),
        to: to.to_account_info(),
        mint: mint.to_account_info(),
        authority: authority.clone(),
    };
    let cpi_context = CpiContext::new(token_program.to_account_info(), transfer_options);

    // Call the transfer instruction
    transfer_checked(
        cpi_context,
        *amount,
        mint.decimals,
    )?;

    Ok(())
}

// Convenience functions to mint and burn tokens from a program using a PDA signer

pub fn mint_tokens<'info>(
    to: &InterfaceAccount<'info, TokenAccount>,
    amount: &u64,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    authority_seeds: &[&[&[u8]]],
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    // Build the arguments for the mint instruction
    let mint_options = MintTo {
        mint: mint.to_account_info(),
        to: to.to_account_info(),
        authority: authority.clone(),
    };

    let cpi_context = CpiContext::new_with_signer(token_program.to_account_info(), mint_options, authority_seeds);

    // Call the mint instruction
    mint_to(
        cpi_context,
        *amount,
    )?;

    Ok(())
}

pub fn burn_tokens<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    amount: &u64,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &AccountInfo<'info>,
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    // Build the arguments for the burn instruction
    let burn_options = Burn {
        mint: mint.to_account_info(),
        from: from.to_account_info(),
        authority: authority.clone(),
    };

    let cpi_context = CpiContext::new(token_program.to_account_info(), burn_options);

    // Call the burn instruction
    burn(
        cpi_context,
        *amount,
    )?;

    Ok(())
}

/// This function deals with verification of Merkle trees (hash trees).
/// Direct port of https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v3.4.0/contracts/cryptography/MerkleProof.sol
/// Returns true if a `leaf` can be proved to be a part of a Merkle tree
/// defined by `root`. For this, a `proof` must be provided, containing
/// sibling hashes on the branch from the leaf to the root of the tree. Each
/// pair of leaves and each pair of pre-images are assumed to be sorted.
pub fn verify_in_tree(proof: Vec<[u8; 32]>, root: [u8; 32], leaf: [u8; 32]) -> bool {
    let mut computed_hash = leaf;
    for proof_element in proof.into_iter() {
        if computed_hash <= proof_element {
            // Hash(current computed hash + current element of the proof)
            computed_hash =
                solana_program::hash::hashv(&[&[1u8], &computed_hash, &proof_element]).to_bytes();
        } else {
            // Hash(current element of the proof + current computed hash)
            computed_hash =
                solana_program::hash::hashv(&[&[1u8], &proof_element, &computed_hash]).to_bytes();
        }
    }
    // Check if the computed hash (root) is equal to the provided root
    computed_hash == root
}

/// This function verifies that a leaf is NOT part of a Merkle tree.
/// It verifies that:
/// 1. The provided sibling would occupy the same position as our leaf
///    (by checking they would take the same path through the tree)
/// 2. The sibling's path to the root is valid
/// 3. The sibling is different from our leaf
pub fn verify_not_in_tree(
    proof: Vec<[u8; 32]>, 
    root: [u8; 32], 
    leaf: [u8; 32],
    sibling: [u8; 32]
) -> bool {
    if sibling == leaf {
        return false;
    }

    // Verify both values would take the same path through the tree
    let mut leaf_hash = leaf;
    let mut sibling_hash = sibling;
    let mut valid_path = true;

    for proof_element in proof.iter() {
        // Check if they would make the same left/right choice at this level
        let leaf_goes_left = leaf_hash <= *proof_element;
        let sibling_goes_left = sibling_hash <= *proof_element;
        
        if leaf_goes_left != sibling_goes_left {
            valid_path = false;
            break;
        }

        // Compute the next hash for both
        if leaf_goes_left {
            leaf_hash = solana_program::hash::hashv(&[&[1u8], &leaf_hash, proof_element]).to_bytes();
            sibling_hash = solana_program::hash::hashv(&[&[1u8], &sibling_hash, proof_element]).to_bytes();
        } else {
            leaf_hash = solana_program::hash::hashv(&[&[1u8], proof_element, &leaf_hash]).to_bytes();
            sibling_hash = solana_program::hash::hashv(&[&[1u8], proof_element, &sibling_hash]).to_bytes();
        }
    }

    // The sibling path must be valid (hash to root) and both values must take the same path
    valid_path && sibling_hash == root
}