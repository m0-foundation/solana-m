// registrar/state/register.rs

use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Register {
    pub value: [u8; 32],
}