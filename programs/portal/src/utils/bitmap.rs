use anchor_lang::prelude::*;
use bitmaps::Bitmap as BM;

use crate::errors::PortalError;

#[derive(Clone, AnchorDeserialize, AnchorSerialize, InitSpace)]
pub struct Bitmap {
    map: u128,
}

impl Default for Bitmap {
    fn default() -> Self {
        Self::new()
    }
}

impl Bitmap {
    pub const BITS: u8 = 128;

    pub fn new() -> Self {
        Bitmap { map: 0 }
    }

    pub fn from_value(value: u128) -> Self {
        Bitmap { map: value }
    }

    pub fn set(&mut self, index: u8, value: bool) -> Result<()> {
        if index >= Self::BITS {
            return Err(PortalError::BitmapIndexOutOfBounds.into());
        }
        let mut bm = BM::<128>::from_value(self.map);
        bm.set(usize::from(index), value);
        self.map = *bm.as_value();
        Ok(())
    }

    pub fn get(&self, index: u8) -> Result<bool> {
        if index >= Self::BITS {
            return Err(PortalError::BitmapIndexOutOfBounds.into());
        }
        Ok(BM::<128>::from_value(self.map).get(usize::from(index)))
    }

    pub fn count_enabled_votes(&self, enabled: Bitmap) -> u8 {
        let bm = BM::<128>::from_value(self.map) & BM::<128>::from_value(enabled.map);
        bm.len()
            .try_into()
            .expect("Bitmap length must not exceed the bounds of u8")
    }

    pub fn len(self) -> usize {
        BM::<128>::from_value(self.map).len()
    }

    pub fn is_empty(self) -> bool {
        BM::<128>::from_value(self.map).is_empty()
    }
}
