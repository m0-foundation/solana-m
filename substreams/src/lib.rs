use events::Transactions;
use pb::transfers::v1::{TokenBalanceUpdate, TokenTransaction, TokenTransactions};
use substreams_solana_utils::{
    instruction::{self, StructuredInstructions},
    log::Log,
    transaction,
};

mod events;
mod pb;

#[substreams::handlers::map]
fn map_my_data(transactions: Transactions) -> TokenTransactions {
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
        };

        for token_account in context.token_accounts.values() {
            txn.balance_updates.push(TokenBalanceUpdate {
                pubkey: token_account.address.to_string(),
                mint: token_account.mint.to_string(),
                owner: token_account.owner.to_string(),
                pre_balance: token_account.pre_balance.unwrap_or(0),
                post_balance: token_account.post_balance.unwrap_or(0),
            });
        }

        for ix in instructions {
            let data_logs: Vec<&Log> = ix
                .logs()
                .as_ref()
                .unwrap_or(&vec![])
                .iter()
                .filter(|log| matches!(log, Log::Data(_)))
                .collect();

            let program_id = ix.program_id().to_string();
        }

        events.transactions.push(txn);
    }

    events
}
