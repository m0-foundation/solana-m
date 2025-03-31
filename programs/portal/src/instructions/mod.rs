pub mod admin;
pub mod initialize;
pub mod luts;
pub mod mark_outbox_item_as_released;
pub mod redeem;
pub mod release_inbound;
pub mod transfer;

use anchor_lang::prelude::*;
pub use admin::*;
pub use initialize::*;
pub use luts::*;
pub use mark_outbox_item_as_released::*;
pub use redeem::*;
pub use release_inbound::*;
pub use transfer::*;

#[event]
pub struct BridgeEvent {
    pub amount: i64,
    pub token_supply: u64,
    pub recipient: [u8; 32],
    pub wormhole_chain_id: u16,
}
