mod pb;

use pb::token::v1::{TokenTransactionEvent, TokenTransactionEvents};
use substreams_solana::pb::sf::solana::r#type::v1::Transaction;
use substreams_solana_utils as utils;

#[substreams::handlers::map]
fn map_token_transaction_data(transactions: Transaction) -> TokenTransactionEvents {
    let mut events = TokenTransactionEvents::default();

    for transaction in transactions.transactions.iter() {
        events.transactions.push(TokenTransactionEvent {
            signature: utils::transaction::get_signature(transaction),
        });
    }

    events
}
