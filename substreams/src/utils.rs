use crate::pb::transfers::v1::{self, instruction::Update};
use anchor_lang::{prelude::*, Discriminator};
use earn::instructions::{claim_for::RewardsClaim, IndexUpdate};
use regex::Regex;
use std::collections::HashMap;
use substreams_solana::pb::sf::solana::r#type::v1::ConfirmedTransaction;
use substreams_solana_utils::{
    log::{self, Log},
    pubkey::{Pubkey, PubkeyRef},
    spl_token::TokenAccount,
};

const DISCRIMINATOR_SIZE: usize = 8;

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

pub fn token_accounts(t: &ConfirmedTransaction) -> Vec<TokenAccount> {
    let accounts = t
        .resolved_accounts()
        .iter()
        .map(|x| PubkeyRef { 0: x })
        .collect::<Vec<_>>();

    let mut token_accounts: HashMap<PubkeyRef, TokenAccount> = HashMap::new();

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
            mint: Pubkey::try_from_string(&token_balance.mint).unwrap(),
            owner: Pubkey::try_from_string(&token_balance.owner).unwrap(),
            pre_balance: Some(0),
            post_balance: Some(balance),
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
            .and_modify(|e| e.pre_balance = Some(balance));
    }

    token_accounts.values().cloned().collect()
}
