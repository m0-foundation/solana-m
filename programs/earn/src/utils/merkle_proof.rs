// earn/utils/merkle_proof.rs

use solana_program;
use anchor_lang::prelude::*;

pub const ZERO_BIT: u8 = 0;
pub const ONE_BIT: u8 = 1;

#[derive(AnchorDeserialize, AnchorSerialize, Clone, Debug)]
pub struct ProofElement {
    pub node: [u8; 32],
    pub on_right: bool,
}

pub fn verify_in_tree(
    root: [u8; 32],
    value: [u8; 32],
    proof: Vec<ProofElement>
) -> bool {
    let leaf = solana_program::keccak::hashv(&[&[ZERO_BIT], value.as_slice()]).to_bytes();

    let mut computed_hash = leaf;
    for proof_element in proof.into_iter() {
        msg!("proof element: {:?}", proof_element);
        if proof_element.on_right {
            // Hash(current computed hash + current element of the proof)
            computed_hash =
                solana_program::keccak::hashv(&[&[ONE_BIT], computed_hash.as_slice(), proof_element.node.as_slice()]).to_bytes();
        } else {
            // Hash(current element of the proof + current computed hash)
            computed_hash =
                solana_program::keccak::hashv(&[&[ONE_BIT], proof_element.node.as_slice(), computed_hash.as_slice()]).to_bytes();
        }
    }

    msg!("computed hash: {:?}", computed_hash);
    msg!("root: {:?}", root);
    // Check if the computed hash (root) is equal to the provided root
    computed_hash == root
}

pub fn verify_in_tree_and_get_index(
    root: [u8; 32], 
    value: [u8; 32],
    proof: Vec<ProofElement>
) -> (bool, u64) {
    let leaf = solana_program::keccak::hashv(&[&[ZERO_BIT], value.as_slice()]).to_bytes();

    let mut computed_hash = leaf;
    let mut index: u64 = 0;

    for (i, proof_element) in proof.into_iter().enumerate() {
        msg!("proof element: {:?}", proof_element);
        if proof_element.on_right {
            // Hash(current computed hash + current element of the proof)
            computed_hash =
                solana_program::keccak::hashv(&[&[ONE_BIT], computed_hash.as_slice(), proof_element.node.as_slice()]).to_bytes();
        } else {
            
            // Hash(current element of the proof + current computed hash)
            computed_hash =
                solana_program::keccak::hashv(&[&[ONE_BIT], proof_element.node.as_slice(), computed_hash.as_slice()]).to_bytes();
            // Since the proof element is on the left, we need to increment the index by 2^i 
            index += 2u64.pow(i as u32);
        }
    }

    msg!("computed hash: {:?}", computed_hash);
    msg!("root: {:?}", root);
    // Check if the computed hash (root) is equal to the provided root
    (computed_hash == root, index)
}

pub fn verify_not_in_tree(
    root: [u8; 32],
    value: [u8; 32],
    proofs: Vec<Vec<ProofElement>>,
    neighbors: Vec<[u8; 32]>,
) -> bool {
    // The number of proofs should match the number of neighbors
    // TODO we can make this more efficient using a multiproof, see
    // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/acd4ff74de833399287ed6b31b4debf6b2b35527/contracts/utils/cryptography/MerkleProof.sol#L290
    
    let len = proofs.len();
    if neighbors.len() != len {
        return false;
    }

    // We need between 1 and 2 neighbors, depending on the position of the value in the tree
    if len < 1 || len > 2 {
        return false;
    }

    // Handle the special cases (value is outside the bounds of the tree)
    if len == 1 {
        let neighbor = neighbors[0];
        let proof = &proofs[0];

        // The value is smaller than the smallest value in the tree
        if value < neighbor {
            let (neighbor_in_tree, neighbor_index) = verify_in_tree_and_get_index(root, neighbor, proof.clone());

            // The neighbor should be the first leaf in the tree
            return neighbor_in_tree && neighbor_index == 0;
        } else if value > neighbor {
            // Calculate the expected index of the neighbor (last leaf in the tree)
            // based on the length of the proof.
            // @audit I believe this works because we use different bits to hash leafs vs. nodes to protect 
            // against second pre-image attacks -> attacker cannot provide a proof that hashes to the root 
            // using a subset of the tree (which would be shorter)
            let expected_index = 2u64.pow(proof.len() as u32) - 1;

            let (neighbor_in_tree, neighbor_index) = verify_in_tree_and_get_index(root, neighbor, proof.clone());

            return neighbor_in_tree && neighbor_index == expected_index;
        } else {
            // proof is invalid since we should have two neighbors
            return false;
        }
    }

    // Length is 2 -> trying to prove that a value within the bounds of the tree is not in it
    let left_neighbor = neighbors[0];
    let left_proof = &proofs[0];

    let right_neighbor = neighbors[1];
    let right_proof = &proofs[1];

    // Verify that the left neighbor is smaller than the right neighbor and that the value is between them
    if left_neighbor >= right_neighbor || value <= left_neighbor || value >= right_neighbor {
        return false;
    }

    // Verify that the left neighbor is in the tree
    let (left_in_tree, left_index) = verify_in_tree_and_get_index(root, left_neighbor, left_proof.clone());
    if !left_in_tree {
        return false;
    }

    // Verify that the right neighbor is in the tree
    let (right_in_tree, right_index) = verify_in_tree_and_get_index(root, right_neighbor, right_proof.clone());
    if !right_in_tree {
        return false;
    }

    // Verify that the neighbor indices are next to each other
    if left_index + 1 != right_index {
        return false;
    }

    // The leaf is not in the tree
    true
} 