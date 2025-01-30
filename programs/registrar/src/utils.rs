// registrar/utils.rs

use bs58;

pub fn to_base58(key: &[u8]) -> String {
    bs58::encode(key).into_string()
}