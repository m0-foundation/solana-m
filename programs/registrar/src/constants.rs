// registrar/constants.rs

pub use common::constants::*;

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