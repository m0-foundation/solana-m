use substreams_solana::pb::sf::solana::r#type::v1::ConfirmedTransaction;

pub fn get_signature(transaction: &ConfirmedTransaction) -> String {
    bs58::encode(
        transaction
            .transaction
            .as_ref()
            .unwrap()
            .signatures
            .get(0)
            .unwrap(),
    )
    .into_string()
}
