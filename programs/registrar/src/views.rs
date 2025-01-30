// registrar/utils.rs

// external dependencies
use anchor_lang::prelude::*;

// local dependencies
use crate::{
    errors::RegistrarError,
    state::{Flag, Register}
};

pub fn is_in_list(registrar_pubkey: &Pubkey, flag_account: &AccountInfo, flag_bump: u8, list: &[u8], address: &Pubkey) -> Result<bool> {
    // To validate the account we must ensure the following: 
    // 1. The address must match the expected PDA address for the signer's pubkey
    let computed_account = match Pubkey::create_program_address(
        &[b"LIST", list, address.as_ref(), &[flag_bump]],
        registrar_pubkey
    ) {
        Ok(pubkey) => pubkey,
        Err(_) => return err!(RegistrarError::InvalidPDA),
    };
    
    msg!("computed_account: {:?}", computed_account);
    msg!("flag_account.key: {:?}", flag_account.key);
    if &computed_account != flag_account.key {
        return err!(RegistrarError::InvalidPDA);
    }

    // 2. It must be owned by the REGISTRAR program -> which means the account has been initialized
    msg!("flag_account.owner: {:?}", flag_account.owner);
    msg!("registrar_pubkey: {:?}", registrar_pubkey);
    if flag_account.owner != registrar_pubkey {
        return err!(RegistrarError::NotInitialized);
    };

    // 3. Once deserialized, the flag must be true for the address to be in the list.
    let mut flag_data: &[u8] = &flag_account.data.borrow();
    let in_list = Flag::try_deserialize(&mut flag_data)?.value;
    Ok(in_list)
}

pub fn get_key_value(registrar_pubkey: &Pubkey, register_account: &AccountInfo, register_bump: u8, key: &[u8]) -> Result<[u8; 32]> {
    // To validate the account we must ensure the following: 
    // 1. It must be owned by the REGISTRAR program
    require_keys_eq!(
        *registrar_pubkey,
        *register_account.owner
    );
   
    // 2. The address must match the expected PDA address for the signer's pubkey
    let computed_account = match Pubkey::create_program_address(
        &[b"VALUE", key, &[register_bump]],
        registrar_pubkey
    ) {
        Ok(pubkey) => pubkey,
        Err(_) => return err!(RegistrarError::InvalidPDA),
    };

    require_keys_eq!(
        computed_account,
        *register_account.key
    );

    // 3. Once deserialized, return the value of the register.
    // TODO: If it cannot be deserialized, return an error or empty array?
    match Register::try_from_slice(&register_account.data.borrow()) {
        Ok(register) => Ok(register.value),
        Err(_) => Ok([0u8; 32])
    }
}