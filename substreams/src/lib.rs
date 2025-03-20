use pb::transfers::v1::{Instruction, TokenBalanceUpdate, TokenTransaction, TokenTransactions};
use substreams_solana::pb::sf::solana::r#type::v1::Block;
use substreams_solana_utils::{
    instruction::{self},
    pubkey::Pubkey,
    transaction,
};
use utils::{parse_logs_for_events, parse_logs_for_instruction_name, token_accounts};

use consts::MINT;
use consts::SYSTEM_PROGRAMS;

mod consts;
mod pb;
mod utils;

#[substreams::handlers::map]
fn map_transfer_events(block: Block) -> TokenTransactions {
    let mut events = TokenTransactions {
        blockhash: block.blockhash,
        slot: block.slot,
        block_time: 0,
        block_height: 0,
        transactions: vec![],
    };

    if let Some(height) = block.block_height {
        events.block_height = height.block_height;
    }
    if let Some(time) = block.block_time {
        events.block_time = time.timestamp;
    }

    for t in block.transactions {
        let context = match transaction::get_context(&t) {
            Ok(context) => context,
            Err(_) => continue,
        };

        let instructions = match instruction::get_structured_instructions(&t) {
            Ok(instructions) => instructions,
            Err(_) => continue,
        };

        let mut txn = TokenTransaction {
            signature: context.signature.to_string(),
            balance_updates: vec![],
            instructions: vec![],
        };

        // Parse token account balance updates from mints and transfers
        for token_account in token_accounts(&t) {
            if token_account.mint != MINT {
                continue;
            }
            if token_account.pre_balance == token_account.post_balance {
                continue;
            }
            txn.balance_updates.push(TokenBalanceUpdate {
                pubkey: token_account.address.to_string(),
                mint: token_account.mint.to_string(),
                owner: token_account.owner.to_string(),
                pre_balance: token_account.pre_balance.unwrap_or(0),
                post_balance: token_account.post_balance.unwrap_or(0),
            });
        }

        // Parse instruction logs and updates
        for ix in instructions {
            let pid = ix.program_id().to_pubkey().unwrap_or(Pubkey::default());

            // Ignore system programs
            if SYSTEM_PROGRAMS.contains(&pid) {
                continue;
            }

            // Use logs to get events and instruction name
            txn.instructions.push(Instruction {
                program_id: pid.to_string(),
                instruction: parse_logs_for_instruction_name(ix.logs().as_ref()),
                update: parse_logs_for_events(ix.logs().as_ref()),
            });
        }

        events.transactions.push(txn);
    }

    events
}
