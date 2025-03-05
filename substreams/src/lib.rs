use events::{parse_logs, Transactions};
use pb::transfers::v1::{Instruction, TokenBalanceUpdate, TokenTransaction, TokenTransactions};
use substreams_solana_utils::{
    instruction::{self, StructuredInstructions},
    transaction,
};

mod events;
mod pb;

#[substreams::handlers::map]
fn map_transfer_events(transactions: Transactions) -> TokenTransactions {
    let mut events = TokenTransactions::default();

    for t in transactions.transactions {
        let context = match transaction::get_context(&t) {
            Ok(context) => context,
            Err(_) => continue,
        };

        let instructions = match instruction::get_structured_instructions(&t) {
            Ok(instructions) => instructions.flattened(),
            Err(_) => continue,
        };

        let mut txn = TokenTransaction {
            signature: context.signature.to_string(),
            balance_updates: vec![],
            instructions: vec![],
        };

        // Parse token account balance updates from mints and transfers
        for token_account in context.token_accounts.values() {
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
            let logs: Vec<String> = ix
                .logs()
                .as_ref()
                .unwrap_or(&vec![])
                .iter()
                .map(|log| log.to_string())
                .collect();

            // Grab logs and check them for events
            txn.instructions.push(Instruction {
                program_id: ix.program_id().to_string(),
                logs,
                update: parse_logs(ix.logs().as_ref()),
            });
        }

        events.transactions.push(txn);
    }

    events
}
