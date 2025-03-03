mod pb;
use pb::{mydata::v1 as mydata, sf::substreams::solana::v1::Transactions};

#[substreams::handlers::map]
fn map_my_data(transactions: Transactions) -> mydata::MyData {
    // TODO: Modify this code to get the data that you need from the transactions.

    let mut my_data = mydata::MyData::default();
    my_data.transactions = transactions.transactions;
    my_data
}
