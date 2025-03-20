use crate::pb::transfers::v1::{self, instruction::Update};
use anchor_lang::{prelude::*, Discriminator};
use regex::Regex;
use std::collections::HashMap;
use std::str::FromStr;
use substreams_solana::pb::sf::solana::r#type::v1::ConfirmedTransaction;
use substreams_solana_utils::log::{self, Log};

const DISCRIMINATOR_SIZE: usize = 8;

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
    pub recipient_token_account: Pubkey,
    pub amount: u64,
    pub ts: u64,
    pub index: u64,
}

pub fn parse_logs_for_events(logs: Option<&Vec<Log>>) -> Option<Update> {
    if logs.is_none() {
        return None;
    }

    for log in logs.unwrap() {
        if let Log::Data(log) = log {
            if let Some(update) = parse_log_for_events(log) {
                return Some(update);
            }
        }
    }

    None
}

pub fn parse_logs_for_instruction_name(logs: Option<&Vec<Log>>) -> Option<String> {
    if logs.is_none() {
        return None;
    }

    let re = Regex::new(r"Program log: Instruction: (.+)").unwrap();

    for l in logs.unwrap() {
        if let Some(captures) = re.captures(&l.to_string()) {
            return Some(captures.get(1).unwrap().as_str().to_string());
        }
    }

    None
}

pub fn parse_log_for_events(log: &log::DataLog) -> Option<Update> {
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
            recipient_token_account: claim.recipient_token_account.to_string(),
        }));
    }

    None
}

#[derive(Clone, Debug)]
pub struct TokenAccount {
    pub address: Pubkey,
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub pre_balance: u64,
    pub post_balance: u64,
}

pub fn token_accounts(t: &ConfirmedTransaction) -> Vec<TokenAccount> {
    let accounts = t
        .resolved_accounts()
        .iter()
        .map(|x| {
            let bytes: [u8; 32] = x.as_slice().try_into().unwrap();
            Pubkey::new_from_array(bytes)
        })
        .collect::<Vec<_>>();

    let mut token_accounts: HashMap<Pubkey, TokenAccount> = HashMap::new();

    for token_balance in &t.meta.as_ref().unwrap().post_token_balances {
        let balance = token_balance
            .ui_token_amount
            .as_ref()
            .unwrap()
            .amount
            .parse::<u64>()
            .unwrap_or(0);

        let token_account = TokenAccount {
            address: accounts[token_balance.account_index as usize].clone(),
            mint: Pubkey::from_str(&token_balance.mint).unwrap(),
            owner: Pubkey::from_str(&token_balance.owner).unwrap(),
            pre_balance: 0,
            post_balance: balance,
        };

        token_accounts.insert(token_account.address, token_account);
    }

    // account with no balace prior to the transaction will be missing
    for token_balance in &t.meta.as_ref().unwrap().pre_token_balances {
        let balance = token_balance
            .ui_token_amount
            .as_ref()
            .unwrap()
            .amount
            .parse::<u64>()
            .unwrap_or(0);

        token_accounts
            .entry(accounts[token_balance.account_index as usize])
            .and_modify(|e| e.post_balance = balance);
    }

    token_accounts.values().cloned().collect()
}
