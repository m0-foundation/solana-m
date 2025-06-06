use substreams_solana_utils::pubkey::Pubkey;

macro_rules! pubkey {
    ($input:literal) => {
        Pubkey(five8_const::decode_32_const($input))
    };
}

pub const MINT_DEVNET: Pubkey = pubkey!("mzeroZRGCah3j5xEWp2Nih3GDejSBbH1rbHoxDg8By6");
pub const MINT: Pubkey = pubkey!("mzerokyEX9TNDoK4o2YZQBDmMzjokAeN6M2g2S3pLJo");
pub const EXT_MINT: Pubkey = pubkey!("mzeroXDoBpRVhnEXBra27qzAMdxgpWVY3DzQW7xMVJp");
pub const COMPUTE_PID: Pubkey = pubkey!("ComputeBudget111111111111111111111111111111");
pub const SYSTEM_PID: Pubkey = pubkey!("11111111111111111111111111111111");
pub const MEMO_PID: Pubkey = pubkey!("Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo");

pub const SYSTEM_PROGRAMS: [Pubkey; 3] = [SYSTEM_PID, COMPUTE_PID, MEMO_PID];
pub const MINTS: [Pubkey; 3] = [MINT, MINT_DEVNET, EXT_MINT];
