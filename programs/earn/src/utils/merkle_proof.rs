//! copy-pasta from [here](https://github.com/saber-hq/merkle-distributor/blob/ac937d1901033ecb7fa3b0db22f7b39569c8e052/programs/merkle-distributor/src/merkle_proof.rs)
//! modified to include INTERMEDIATE_HASH prefix and sha256 hashing
use crate::constants::ONE_BIT;
use solana_program;
use anchor_lang::prelude::msg;

/// This function deals with verification of Merkle trees (hash trees).
/// Direct port of https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v3.4.0/contracts/cryptography/MerkleProof.sol
/// Returns true if a `leaf` can be proved to be a part of a Merkle tree
/// defined by `root`. For this, a `proof` must be provided, containing
/// sibling hashes on the branch from the leaf to the root of the tree. Each
/// pair of leaves and each pair of pre-images are assumed to be sorted.
pub fn verify_in_tree(proof: Vec<[u8; 32]>, root: [u8; 32], leaf: [u8; 32]) -> bool {
    let mut computed_hash = leaf;
    for proof_element in proof.into_iter() {
        msg!("proof element: {:?}", proof_element);


        if computed_hash <= proof_element {
            // Hash(current computed hash + current element of the proof)
            computed_hash =
                solana_program::keccak::hashv(&[&[ONE_BIT], computed_hash.as_slice(), proof_element.as_slice()]).to_bytes();
        } else {
            // Hash(current element of the proof + current computed hash)
            computed_hash =
                solana_program::keccak::hashv(&[&[ONE_BIT], proof_element.as_slice(), computed_hash.as_slice()]).to_bytes();
        }
    }

    msg!("computed hash: {:?}", computed_hash);
    msg!("root: {:?}", root);
    // Check if the computed hash (root) is equal to the provided root
    computed_hash == root
}

/// This function verifies that a leaf is NOT part of a Merkle tree.
/// It verifies that:
/// 1. The provided neighbor would occupy the same position as our leaf
///    (by checking they would take the same path through the tree)
/// 2. The neighbor's path to the root is valid
/// 3. The neighbor is different from our leaf

// TODO you actually need to prove that both neighbors are in the tree and that they are next to each other
pub fn verify_not_in_tree(
    root: [u8; 32], 
    leaf: [u8; 32],
    left_proof: Vec<[u8; 32]>, 
    left_neighbor: [u8; 32],
    right_proof: Vec<[u8; 32]>,
    right_neighbor: [u8; 32],
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
        // TODO this doesn't work with hashes
        let leaf_goes_left = leaf_hash <= *proof_element;
        let sibling_goes_left = sibling_hash <= *proof_element;
        
        if leaf_goes_left != sibling_goes_left {
            valid_path = false;
            break;
        }

        // Compute the next hash for both
        if leaf_goes_left {
            leaf_hash = solana_program::keccak::hashv(&[&[ONE_BIT], leaf_hash.as_slice(), proof_element.as_slice()]).to_bytes();
            sibling_hash = solana_program::keccak::hashv(&[&[ONE_BIT], sibling_hash.as_slice(), proof_element.as_slice()]).to_bytes();
        } else {
            leaf_hash = solana_program::keccak::hashv(&[&[ONE_BIT], proof_element.as_slice(), leaf_hash.as_slice()]).to_bytes();
            sibling_hash = solana_program::keccak::hashv(&[&[ONE_BIT], proof_element.as_slice(), sibling_hash.as_slice()]).to_bytes();
        }
    }

    // The sibling path must be valid (hash to root) and both values must take the same path
    valid_path && sibling_hash == root
}