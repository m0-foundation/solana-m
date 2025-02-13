use anchor_lang::prelude::*;

pub mod instructions;

declare_id!("GGxDgRiGrjX6VsCrTWJZs25Hn8dPJc346RdbgpL1Wnmi");

#[program]
pub mod portal {
    use super::*;

    // Inbound Instructions

    pub fn receive_wormhole_message(ctx: Context<ReceiveMessage>) -> Result<()> {
        instructions::receive_message(ctx)
    }
}
