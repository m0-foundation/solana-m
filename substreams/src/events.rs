use substreams_solana::pb::sf::solana::r#type::v1::ConfirmedTransaction;

#[derive(Clone, PartialEq, ::prost::Message)]
pub struct Transactions {
    #[prost(message, repeated, tag = "1")]
    pub transactions: ::prost::alloc::vec::Vec<ConfirmedTransaction>,
}
