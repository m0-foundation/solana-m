import * as anchor from "@coral-xyz/anchor";
import { SolanaNtt } from "@wormhole-foundation/sdk-solana-ntt";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
    deserialize,
    encoding,
    serialize,
    serializePayload,
    signSendWait as ssw,
    UniversalAddress,
    Wormhole,
} from "@wormhole-foundation/sdk";
import {
    SolanaAddress,
    SolanaSendSigner,
    SolanaUnsignedTransaction,
} from "@wormhole-foundation/sdk-solana";
import * as spl from "@solana/spl-token";
import { getWormholeContext, loadKeypair } from "../test-utils";
import { createSetAuthorityInstruction } from "@solana/spl-token";
import * as testing from "@wormhole-foundation/sdk-definitions/testing";
import { utils } from "web3";


/*
 * Tests against solana-test-validator to better match devnet and mainnet.
 * Disable 'account data direct mapping' feature to test stack height bugs.
 * See test-local-validator in Makefile
*/
describe("portal - solana-test-validator", () => {
    anchor.setProvider(anchor.AnchorProvider.env());
    const provider = anchor.getProvider();
    const connection = anchor.getProvider().connection;
    const payer = anchor.Wallet.local().payer;
    const { ctx, remoteXcvr, remoteMgr, coreBridge } = getWormholeContext(connection);

    const mint = loadKeypair("tests/keys/mint.json");
    const multisig = Keypair.generate();
    const signer = new SolanaSendSigner(connection, "Solana", payer, false, {});
    const sender = Wormhole.parseAddress("Solana", signer.address());

    const ntt = new SolanaNtt(
        "Devnet",
        "Solana",
        connection,
        {
            ...ctx.config.contracts,
            ntt: {
                token: mint.publicKey.toBase58(),
                manager: "mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY",
                transceiver: {
                    wormhole: "mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY",
                },
            },
        },
        "3.0.0"
    );

    it("initialize", async () => {
        const mintLen = spl.getMintLen([]);
        const lamports = await connection.getMinimumBalanceForRentExemption(
            mintLen
        );

        // create mint
        const tx = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: payer.publicKey,
                newAccountPubkey: mint.publicKey,
                space: mintLen,
                lamports,
                programId: spl.TOKEN_2022_PROGRAM_ID,
            }),
            spl.createInitializeMintInstruction(
                mint.publicKey,
                9,
                payer.publicKey,
                null,
                spl.TOKEN_2022_PROGRAM_ID
            )
        );

        await provider.sendAndConfirm(tx, [payer, mint]);

        // create multisig
        const multiSigTx = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: payer.publicKey,
                newAccountPubkey: multisig.publicKey,
                space: spl.MULTISIG_SIZE,
                lamports: await spl.getMinimumBalanceForRentExemptMultisig(
                    connection
                ),
                programId: spl.TOKEN_2022_PROGRAM_ID,
            }),
            spl.createInitializeMultisigInstruction(
                multisig.publicKey,
                [payer.publicKey, ntt.pdas.tokenAuthority()],
                1,
                spl.TOKEN_2022_PROGRAM_ID
            ),
            createSetAuthorityInstruction(
                mint.publicKey,
                payer.publicKey,
                spl.AuthorityType.MintTokens,
                multisig.publicKey,
                [],
                spl.TOKEN_2022_PROGRAM_ID
            )
        );

        await provider.sendAndConfirm(multiSigTx, [payer, multisig]);

        // init portal
        const initTxs = ntt.initialize(sender, {
            mint: mint.publicKey,
            outboundLimit: 1000000n,
            mode: "burning",
            multisig: multisig.publicKey,
        });
        async function* onlyInit() {
            yield (await initTxs.next()).value as SolanaUnsignedTransaction<
                "Devnet",
                "Solana"
            >;
        }
        await ssw(ctx, onlyInit(), signer);

        // register
        const registerTxs = ntt.registerWormholeTransceiver({
            payer: new SolanaAddress(payer.publicKey),
            owner: new SolanaAddress(payer.publicKey),
        });
        await ssw(ctx, registerTxs, signer);

        // Set Wormhole xcvr peer
        const setXcvrPeerTxs = ntt.setWormholeTransceiverPeer(
            remoteXcvr,
            sender
        );
        await ssw(ctx, setXcvrPeerTxs, signer);

        // Set manager peer
        const setPeerTxs = ntt.setPeer(remoteMgr, 9, 1000000n, sender);
        await ssw(ctx, setPeerTxs, signer);
    });

    it("receive", async () => {
        const emitter = new testing.mocks.MockEmitter(
            remoteXcvr.address as UniversalAddress,
            "Ethereum",
            0n
        );

        const guardians = new testing.mocks.MockGuardians(0, ["cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0"]);

        const sendingTransceiverMessage = {
            sourceNttManager: remoteMgr.address as UniversalAddress,
            recipientNttManager: new UniversalAddress(
                ntt.program.programId.toBytes()
            ),
            nttManagerPayload: {
                id: encoding.bytes.encode("sequence1".padEnd(32, "0")),
                sender: new UniversalAddress("FACE".padStart(64, "0")),
                payload: {
                    trimmedAmount: {
                        amount: 10_000n,
                        decimals: 8,
                    },
                    sourceToken: new UniversalAddress("FAFA".padStart(64, "0")),
                    recipientAddress: new UniversalAddress(payer.publicKey.toBytes()),
                    recipientChain: "Solana",
                    additionalPayload: Buffer.from(utils.encodePacked(
                        { type: "uint64", value: 1_000_000_000_001n }, // index
                        { type: "bytes32", value: "0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b" } // destination
                    ).slice(2), "hex"),
                },
            },
            transceiverPayload: new Uint8Array(),
        } as const;

        const serialized = serializePayload(
            "Ntt:WormholeTransfer",
            sendingTransceiverMessage
        );
        const published = emitter.publishMessage(0, serialized, 200);
        const rawVaa = guardians.addSignatures(published, [0]);
        const vaa = deserialize("Ntt:WormholeTransfer", serialize(rawVaa));
        const redeemTxs = ntt.redeem([vaa], sender, multisig.publicKey);
        await ssw(ctx, redeemTxs, signer);
    });

    it("send", async () => {
        const amount = 100_000n;
        const sender = Wormhole.parseAddress("Solana", signer.address());
        const receiver = testing.utils.makeUniversalChainAddress("Ethereum");

        const outboxItem = Keypair.generate();
        const xferTxs = ntt.transfer(
            sender,
            amount,
            receiver,
            { queue: false, automatic: false, gasDropoff: 0n },
            outboxItem
        );
        await ssw(ctx, xferTxs, signer);
    });
});
