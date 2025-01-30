// mint-master/lib.rs - single file program

// external dependencies
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    Mint,
    SetAuthority,
    TokenAccount,
    TokenInterface,
    set_authority,
    spl_token_2022::instruction::AuthorityType::MintTokens
};
use solana_program::program_option::COption;

// local dependencies
use common::{
    constants::{
        ANCHOR_DISCRIMINATOR_SIZE,
        DEFAULT_ADMIN, 
        MINT
    },
    utils::mint_tokens,
};

// program
declare_id!("7j9tN2dS7CuPfKPFvhh8HWWNgsPgN7jsDdDiPXMrjemb");

// We assume that the mint master PDA is the mint authority for the token mint.
// It would need to be set to that before it will allow the portal and distributor to mint tokens.
// Since the mint master may need to change over time, we need the ability to move the mint authority 
// to a different account to accomplish a migration.
#[program]
pub mod mint_master {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, portal: Pubkey, distributor: Pubkey) -> Result<()> {
        // Store the portal and distributor addresses in the mint master account
        ctx.accounts.mint_master.portal = portal;
        ctx.accounts.mint_master.distributor = distributor;

        Ok(())
    }

    pub fn mint_m(ctx: Context<MintM>, amount: u64) -> Result<()> {
        // Validate that the signer and determine the mint type
        let signer_key = ctx.accounts.signer.key();
        if signer_key == ctx.accounts.mint_master.portal {
            msg!("Minting {} bridged tokens from Portal to user account {}.", amount, ctx.accounts.to_token_account.key());
        } else if signer_key == ctx.accounts.mint_master.distributor {
            msg!("Distributing {} tokens earned as yield to user account {}.", amount, ctx.accounts.to_token_account.key());
        } else {
            return err!(MintMasterError::InvalidSigner);
        }

        // Mint the tokens
        // We return the result of the mint tokens function as the result of the instruction
        let mint_authority_seeds: &[&[&[u8]]] = &[&[b"mint-master", &[ctx.bumps.mint_master]]];
        mint_tokens(
            &ctx.accounts.to_token_account, // to
            &amount, // amount
            &ctx.accounts.mint, // mint
            &ctx.accounts.mint_master.to_account_info(), // mint authority
            mint_authority_seeds, // mint authority seeds
            &ctx.accounts.token_program // token program
        )
    }

    pub fn set_mint_authority(ctx: Context<SetMintAuthority>, new_authority: Option<Pubkey>) -> Result<()> {
        // Validate the mint master is the current mint authority on the mint
        match ctx.accounts.mint.mint_authority {
            COption::Some(authority) => if authority != ctx.accounts.mint_master.key() { return err!(MintMasterError::NotMintAuthority) },
            COption::None => return err!(MintMasterError::NotMintAuthority),
        }

        // Set the mint authority to the new authority

        // Create the CPI context
        let cpi_accounts = SetAuthority {
            account_or_mint: ctx.accounts.mint.to_account_info(),
            current_authority: ctx.accounts.mint_master.to_account_info(),
        };
        let mint_master_seeds: &[&[&[u8]]] = &[&[b"mint-master", &[ctx.bumps.mint_master]]];
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, mint_master_seeds);

        // Call the set authority instruction
        set_authority(
            cpi_ctx,
            MintTokens,
            new_authority,
        )?;

        Ok(())
    }
}

// instruction contexts

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        mut,
        address = DEFAULT_ADMIN
    )]
    pub signer: Signer<'info>,

    #[account(
        init,
        payer = signer,
        space = ANCHOR_DISCRIMINATOR_SIZE + MintMaster::INIT_SPACE,
        seeds = [b"mint-master"],
        bump,
    )]
    pub mint_master: Account<'info, MintMaster>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintM<'info> {
    pub signer: Signer<'info>,

    #[account(
        seeds = [b"mint-master"],
        bump,
    )]
    pub mint_master: Account<'info, MintMaster>,

    #[account(address = MINT)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        token::mint = mint,
    )]
    pub to_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SetMintAuthority<'info> {
    #[account(
        seeds = [b"mint-master"],
        bump,
    )]
    pub mint_master: Account<'info, MintMaster>,

    #[account(
        mut,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

// accounts

// Note: this is a simplistic/naive implementation that assumes only two addresses will need to mint
// that could change in the future, but we can upgrade the implementation if needed.
#[account]
#[derive(InitSpace)]
pub struct MintMaster {
    pub portal: Pubkey,
    pub distributor: Pubkey,
}


// errors
#[error_code]
pub enum MintMasterError {
    #[msg("Invalid signer")]
    InvalidSigner,
    #[msg("Mint master is not the current mint authority")]
    NotMintAuthority,
}

