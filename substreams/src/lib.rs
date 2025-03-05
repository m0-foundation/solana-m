use events::Transactions;
use pb::{TokenTransaction, TokenTransactions};

mod events;
mod pb;
mod utils;

#[substreams::handlers::map]
fn map_my_data(transactions: Transactions) -> TokenTransactions {
    let mut events = TokenTransactions::default();

    for transaction in transactions.transactions {
        let signature = utils::get_signature(&transaction);
        events.transactions.push(TokenTransaction { signature });
    }

    events
}
