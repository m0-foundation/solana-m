import { Command } from 'commander';
import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    TransactionMessage,
    VersionedTransaction,
} from '@solana/web3.js';
import {
    AuthorityType,
    createInitializeMetadataPointerInstruction,
    createInitializeMintInstruction,
    createInitializeTransferHookInstruction,
    createMultisig,
    createSetAuthorityInstruction,
    ExtensionType,
    getMintLen,
    LENGTH_SIZE,
    setAuthority,
    TOKEN_2022_PROGRAM_ID,
    TYPE_SIZE,
} from '@solana/spl-token';
import {
    createInitializeInstruction,
    createUpdateFieldInstruction,
    pack,
    TokenMetadata,
} from "@solana/spl-token-metadata";
import { loadKeypair } from '../tests/test-utils';

const PORTAL_PID = new PublicKey("mZEroYvA3c4od5RhrCHxyVcs2zKsp8DTWWCgScFzXPr")
const EARN_PID = new PublicKey("MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c")

async function main() {
    const program = new Command();

    program
        .command('create-multisig')
        .description('Create multisig for the mint authority')
        .option('--owner <filepath>', 'owner and payer', 'devnet-key.json')
        .option('--rpcUrl <string>', 'RPC URL', 'https://api.devnet.solana.com')
        .action(async (options) => {
            const connection = new Connection(options.rpcUrl);
            const owner = loadKeypair(options.owner);
            const multisig = Keypair.generate();

            // token authorities for both programs
            const [tokenAuthPortal] = PublicKey.findProgramAddressSync([Buffer.from("token_authority")], PORTAL_PID)
            const [tokenAuthEarn] = PublicKey.findProgramAddressSync([Buffer.from("token_authority")], EARN_PID)

            await createMultisig(
                connection,
                owner,
                [owner.publicKey, tokenAuthPortal, tokenAuthEarn],
                1,
                multisig,
                undefined,
                TOKEN_2022_PROGRAM_ID
            )

            console.log(`Multisig created: ${multisig.publicKey.toBase58()}`);
        });

    program
        .command('create-mint')
        .description('Create a new Token-2022 mint')
        .option('--mint <filepath>', 'mint keypair', 'tests/keys/mint.json')
        .option('--multisig <pubkey>', 'multisig pubkey', '9vR8GRGVXaNq62aiPmUrq5jiE4CXWGFUwJRuo4r2wZgF')
        .option('--owner <filepath>', 'owner and payer', 'devnet-key.json')
        .option('--rpcUrl <string>', 'RPC URL', 'https://api.devnet.solana.com')
        .action(async (options) => {
            const connection = new Connection(options.rpcUrl);
            const owner = loadKeypair(options.owner);
            const mint = loadKeypair(options.mint);
            const multisig = new PublicKey(options.multisig);

            await createToken2022Mint(connection, owner, mint, multisig)
            console.log(`Mint created: ${mint.publicKey.toBase58()}`);
        });

    await program.parseAsync(process.argv);
}

async function createToken2022Mint(
    connection: Connection,
    owner: Keypair,
    mint: Keypair,
    multisig: PublicKey
) {
    const metaData: TokenMetadata = {
        updateAuthority: owner.publicKey,
        mint: mint.publicKey,
        name: "M by M^0",
        symbol: "M",
        uri: "https://etherscan.io/token/images/m0token_new_32.png",
        additionalMetadata: [["evm", "0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b"]],
    };

    // mint size with extensions
    const metadataExtension = TYPE_SIZE + LENGTH_SIZE;
    const metadataLen = pack(metaData).length;
    const mintLen = getMintLen([ExtensionType.TransferHook, ExtensionType.MetadataPointer]);
    const lamports = await connection.getMinimumBalanceForRentExemption(
        mintLen + metadataExtension + metadataLen,
    );

    const instructions = [
        SystemProgram.createAccount({
            fromPubkey: owner.publicKey,
            newAccountPubkey: mint.publicKey,
            space: mintLen,
            lamports,
            programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMetadataPointerInstruction(
            mint.publicKey,
            owner.publicKey,
            mint.publicKey,
            TOKEN_2022_PROGRAM_ID,
        ),
        createInitializeTransferHookInstruction(
            mint.publicKey,
            owner.publicKey, // authority
            PublicKey.default, // no transfer hook
            TOKEN_2022_PROGRAM_ID
        ),
        createInitializeMintInstruction(
            mint.publicKey,
            6,
            owner.publicKey,
            null, // no freeze authority
            TOKEN_2022_PROGRAM_ID
        ),
        createInitializeInstruction({
            programId: TOKEN_2022_PROGRAM_ID,
            metadata: mint.publicKey,
            updateAuthority: owner.publicKey,
            mint: mint.publicKey,
            mintAuthority: owner.publicKey,
            name: metaData.name,
            symbol: metaData.symbol,
            uri: metaData.uri,
        }),
        createUpdateFieldInstruction({
            programId: TOKEN_2022_PROGRAM_ID,
            metadata: mint.publicKey,
            updateAuthority: owner.publicKey,
            field: metaData.additionalMetadata[0][0],
            value: metaData.additionalMetadata[0][1],
        }),
        createSetAuthorityInstruction(
            mint.publicKey,
            owner.publicKey,
            AuthorityType.MintTokens,
            multisig,
            undefined,
            TOKEN_2022_PROGRAM_ID,
        )
    ];

    const blockhash = await connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
        payerKey: owner.publicKey,
        recentBlockhash: blockhash.blockhash,
        instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([owner, mint]);

    await connection.sendTransaction(transaction);
}


main().catch((error) => {
    console.error(error);
    process.exit(1);
});
