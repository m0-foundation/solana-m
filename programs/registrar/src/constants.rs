// registrar/constants.rs

use anchor_lang::{prelude::Pubkey, pubkey};

pub const ADMIN: Pubkey = pubkey!("7cCg21cZSrVVoxVjNUAD4qUnrAjhe1cPvz9Cw3JtkgW8");
pub const ANCHOR_DISCRIMINATOR_SIZE: usize = 8;

pub const fn to_32_byte_array(input: &[u8]) -> [u8; 32] {
    let mut array = [0u8; 32];
    let mut i = 0;
    while i < input.len() && i < 32 {
        array[i] = input[i];
        i += 1;
    }
    array
}

// Default lists
pub const EARN_MANAGER_LIST: [u8; 32] = to_32_byte_array(b"em_admins");
pub const EARNER_LIST: [u8; 32] = to_32_byte_array(b"earners");

// Default keys
pub const EARNERS_LIST_IGNORED_KEY: [u8; 32] = to_32_byte_array(b"earners_list_ignored");