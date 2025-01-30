// registrar/state/flag.rs

use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Flag {
    pub value: bool
}