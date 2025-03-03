mod pb;
use pb::{sf::substreams::solana::v1::Transactions, token::v1::TokenTransactionData};

#[substreams::handlers::map]
fn map_token_transaction_data(transactions: Transactions) -> TokenTransactionData {
    // TODO: Modify this code to get the data that you need from the transactions.

    let mut my_data = TokenTransactionData::default();
    my_data.transactions = transactions.transactions;
    my_data
}
