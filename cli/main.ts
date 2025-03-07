import { Command } from 'commander';
import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction,
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
    TOKEN_2022_PROGRAM_ID,
    TYPE_SIZE,
} from '@solana/spl-token';
import {
    createInitializeInstruction,
    createUpdateFieldInstruction,
    pack,
    TokenMetadata,
} from "@solana/spl-token-metadata";
import { SolanaNtt } from '@wormhole-foundation/sdk-solana-ntt';
import {
    SolanaPlatform,
    SolanaSendSigner,
} from "@wormhole-foundation/sdk-solana";
import {
    Chain,
    ChainAddress,
    UniversalAddress,
    Wormhole,
    assertChain,
    signSendWait,
} from "@wormhole-foundation/sdk";
import { createSetEvmAddresses } from '../tests/test-utils';
import { createInitializeConfidentialTransferMintInstruction } from './confidential-transfers';
import EARN_IDL from "../target/idl/earn.json";
import { Program, Wallet, AnchorProvider, BN } from '@coral-xyz/anchor';
import { Earn } from '../target/types/earn';

const PROGRAMS = {
    // program id the same for devnet and mainnet
    portal: new PublicKey("mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY"),
    earn: new PublicKey("MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c"),
    // addresses the same across L2s 
    evmTransiever: "0x0763196A091575adF99e2306E5e90E0Be5154841",
    evmPeer: "0xD925C84b55E4e44a53749fF5F2a5A13F63D128fd",
    // destination tokens
    mToken: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
    wmToken: '0x437cc33344a0B27A429f795ff6B469C72698B291',
}

const RATE_LIMITS_24 = {
    inbound: 100_000_000n,
    outbound: 100_000_000n,
}

async function main() {
    const program = new Command();

    program
        .command('create-multisig')
        .description('Create multisig for the mint authority')
        .action(async () => {
            const connection = new Connection(process.env.RPC_URL);
            const [owner, multisig] = keysFromEnv(["OWNER_KEYPAIR", "MULTISIG_KEYPAIR"]);

            // token authorities for both programs
            const [tokenAuthPortal] = PublicKey.findProgramAddressSync([Buffer.from("token_authority")], PROGRAMS.portal)
            const [tokenAuthEarn] = PublicKey.findProgramAddressSync([Buffer.from("token_authority")], PROGRAMS.earn)

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
        .action(async () => {
            const connection = new Connection(process.env.RPC_URL);
            const [owner, mint, multisig] = keysFromEnv(["OWNER_KEYPAIR", "MINT_KEYPAIR", "MULTISIG_KEYPAIR"]);

            await createToken2022Mint(connection, owner, mint, multisig.publicKey)
            console.log(`Mint created: ${mint.publicKey.toBase58()}`);
        });

    program
        .command('initialize-portal')
        .description('Initialize the portal program')
        .action(async () => {
            const connection = new Connection(process.env.RPC_URL);
            const [owner, mint, multisig] = keysFromEnv(["OWNER_KEYPAIR", "MINT_KEYPAIR", "MULTISIG_KEYPAIR"]);

            const { ctx, ntt, sender, signer } = NttManager(connection, owner, mint.publicKey);

            const initTxs = ntt.initialize(sender, {
                mint: mint.publicKey,
                outboundLimit: RATE_LIMITS_24.outbound,
                mode: "burning",
                multisig: multisig.publicKey,
            });

            await signSendWait(ctx, initTxs, signer);
            console.log(`Portal initialized: ${PROGRAMS.portal.toBase58()}`);
        });

    program
        .command('initialize-earn')
        .description('Initialize the earn program')
        .action(async () => {
            const connection = new Connection(process.env.RPC_URL);
            const [owner, mint] = keysFromEnv(["OWNER_KEYPAIR", "MINT_KEYPAIR"]);

            const earn = new Program(EARN_IDL as Earn, PROGRAMS.earn, anchorProvider(connection, owner));
            const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from("global")], PROGRAMS.earn)

            await earn.methods
                .initialize(
                    mint.publicKey,
                    Keypair.generate().publicKey,
                    new BN(1001886486057), // initial index
                    new BN(5 * 60) // cooldown
                )
                .accounts({
                    globalAccount,
                    admin: owner.publicKey,
                })
                .signers([owner])
                .rpc();
        });

    program
        .command('set-evm-addresses')
        .description('Set the EVM addresses to the destination tokens')
        .action(async () => {
            const connection = new Connection(process.env.RPC_URL);
            const [owner] = keysFromEnv(["OWNER_KEYPAIR"]);

            const tx = new Transaction().add(createSetEvmAddresses(
                PROGRAMS.portal, owner.publicKey, PROGRAMS.mToken, PROGRAMS.wmToken
            ));

            tx.feePayer = owner.publicKey;
            tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            await sendAndConfirmTransaction(connection, tx, [owner]);

            console.log(`EVM addresses set: ${PROGRAMS.mToken} and ${PROGRAMS.wmToken}`);
        });


    program
        .command('update-lut')
        .description('Initialize or update the LUT for the portal program')
        .action(async () => {
            const connection = new Connection(process.env.RPC_URL);
            const [owner, mint] = keysFromEnv(["OWNER_KEYPAIR", "MINT_KEYPAIR"]);

            const { ctx, ntt, signer } = NttManager(connection, owner, mint.publicKey);

            const lutTxn = ntt.initializeOrUpdateLUT({ payer: owner.publicKey });
            await signSendWait(ctx, lutTxn, signer);
            console.log('LUT updated');
        });

    program
        .command('register-peers')
        .description('Initialize or update the LUT for the portal program')
        .action(async () => {
            const connection = new Connection(process.env.RPC_URL);
            const [owner, mint] = keysFromEnv(["OWNER_KEYPAIR", "MINT_KEYPAIR"]);

            const { ctx, ntt, signer, sender } = NttManager(connection, owner, mint.publicKey);

            // register wormhole xcvr
            const registerTxs = ntt.registerWormholeTransceiver({ payer: sender, owner: sender });
            await signSendWait(ctx, registerTxs, signer);

            const chains = (process.env.NETWORK === "mainnet" ?
                ["Ethereum", "Arbitrum", "Optimism"] :
                ["Sepolia", "ArbitrumSepolia", "OptimismSepolia"]) as Chain[];

            for (let chain of chains) {
                assertChain(chain);
                console.log(`Registering transceiver and peer for ${chain}`);

                // set wormhole xcvr peer
                const remoteXcvr: ChainAddress = { chain, address: new UniversalAddress(PROGRAMS.evmTransiever) }
                const setXcvrPeerTxs = ntt.setWormholeTransceiverPeer(remoteXcvr, sender);
                await signSendWait(ctx, setXcvrPeerTxs, signer);

                // set manager peer
                const remoteMgr: ChainAddress = { chain, address: new UniversalAddress(PROGRAMS.evmPeer) }
                const setPeerTxs = ntt.setPeer(remoteMgr, 9, RATE_LIMITS_24.inbound, sender);
                await signSendWait(ctx, setPeerTxs, signer);
            }

            console.log('Transceiver and peers registered');
        });

    await program.parseAsync(process.argv);
}

function NttManager(connection: Connection, owner: Keypair, mint: PublicKey) {
    const signer = new SolanaSendSigner(connection, "Solana", owner, false, { min: 300_000 });
    const sender = Wormhole.parseAddress("Solana", signer.address());

    const wormholeNetwork = process.env.NETWORK === "devnet" ? "Testnet" : "Mainnet";
    const wh = new Wormhole(wormholeNetwork, [SolanaPlatform]);
    const ctx = wh.getChain("Solana");

    const ntt = new SolanaNtt(
        wormholeNetwork,
        "Solana",
        connection,
        {
            ...ctx.config.contracts,
            ntt: {
                token: mint.toBase58(),
                manager: PROGRAMS.portal.toBase58(),
                transceiver: {
                    wormhole: PROGRAMS.portal.toBase58(),
                },
            },
        },
        "3.0.0",
    );

    return { ctx, ntt, signer, sender }
}

function anchorProvider(connection: Connection, owner: Keypair) {
    return new AnchorProvider(
        connection,
        new Wallet(owner),
        {
            commitment: "confirmed",
            skipPreflight: false
        }
    )
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
        uri: "https://assets.coingecko.com/coins/images/40048/large/M_Symbol_256.png",
        additionalMetadata: [["evm", "0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b"]],
    };

    // mint size with extensions
    const metadataExtension = TYPE_SIZE + LENGTH_SIZE;
    const metadataLen = pack(metaData).length;
    const mintLen = getMintLen([ExtensionType.TransferHook, ExtensionType.MetadataPointer, ExtensionType.ConfidentialTransferMint]);
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
        createInitializeConfidentialTransferMintInstruction(
            mint.publicKey,
            owner.publicKey,
            false
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

function keysFromEnv(keys: string[]) {
    return keys.map((key) => Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env[key]))));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
