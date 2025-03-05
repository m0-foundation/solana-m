use events::Transactions;
use pb::transfers::v1::{TokenTransaction, TokenTransactions};
use substreams_solana_utils::transaction::get_signature;

mod events;
mod pb;

#[substreams::handlers::map]
fn map_my_data(transactions: Transactions) -> TokenTransactions {
    let mut events = TokenTransactions::default();

    for transaction in transactions.transactions {
        let signature = get_signature(&transaction);
        events.transactions.push(TokenTransaction { signature });
    }

    events
}
