use crate::pb::transfers::v1::{self, instruction::Update};
use anchor_lang::{prelude::*, Discriminator};
use substreams_solana::pb::sf::solana::r#type::v1::ConfirmedTransaction;
use substreams_solana_utils::log::{self, Log};

const DISCRIMINATOR_SIZE: usize = 8;

#[derive(Clone, PartialEq, ::prost::Message)]
pub struct Transactions {
    #[prost(message, repeated, tag = "1")]
    pub transactions: ::prost::alloc::vec::Vec<ConfirmedTransaction>,
}

#[event]
pub struct IndexUpdate {
    pub index: u64,
    pub ts: u64,
    pub supply: u64,
    pub max_yield: u64,
}

#[event]
pub struct RewardsClaim {
    pub token_account: Pubkey,
    pub amount: u64,
    pub ts: u64,
    pub index: u64,
}

pub fn parse_logs(logs: Option<&Vec<Log>>) -> Option<Update> {
    if logs.is_none() {
        return None;
    }

    for log in logs.unwrap() {
        if let Log::Data(log) = log {
            if let Some(update) = parse_log(log) {
                return Some(update);
            }
        }
    }

    None
}

pub fn parse_log(log: &log::DataLog) -> Option<Update> {
    let data = match log.data() {
        Ok(data) => data,
        Err(_) => return None,
    };

    if data.len() < DISCRIMINATOR_SIZE {
        return None;
    }

    let (discriminator, buffer) = data.split_at(DISCRIMINATOR_SIZE);

    if IndexUpdate::DISCRIMINATOR == discriminator {
        let update = match IndexUpdate::try_from_slice(buffer) {
            Ok(update) => update,
            Err(_) => return None,
        };
        return Some(Update::IndexUpdate(v1::IndexUpdate {
            index: update.index,
            ts: update.ts,
            supply: update.supply,
            max_yield: update.max_yield,
        }));
    }
    if RewardsClaim::DISCRIMINATOR == discriminator {
        let claim = match RewardsClaim::try_from_slice(buffer) {
            Ok(update) => update,
            Err(_) => return None,
        };
        return Some(Update::Claim(v1::Claim {
            amount: claim.amount,
            token_account: claim.token_account.to_string(),
        }));
    }

    None
}
