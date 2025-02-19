import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js";
import {
    AccountAddress,
    ChainAddress,
    ChainContext,
    Signer,
    UniversalAddress,
    Wormhole,
    deserialize,
    deserializePayload,
    encoding,
    serialize,
    serializePayload,
    signSendWait as ssw,
} from "@wormhole-foundation/sdk";
import * as testing from "@wormhole-foundation/sdk-definitions/testing";
import {
    SolanaAddress,
    SolanaPlatform,
    getSolanaSignAndSendSigner,
} from "@wormhole-foundation/sdk-solana";
import { SolanaWormholeCore } from "@wormhole-foundation/sdk-solana-core";
import { SolanaNtt } from "@wormhole-foundation/sdk-solana-ntt";
import { airdrop, loadKeypair } from "../test-utils";

const TOKEN_PROGRAM = spl.TOKEN_2022_PROGRAM_ID;
const GUARDIAN_KEY = "cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0";
const CORE_BRIDGE_ADDRESS = "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth";
const NTT_ADDRESS = new PublicKey("mZEroYvA3c4od5RhrCHxyVcs2zKsp8DTWWCgScFzXPr")

const connection = new Connection(
    "http://localhost:8899",
    "confirmed"
);

describe("portal", () => {
    let ntt: SolanaNtt<"Devnet", "Solana">;
    let signer: Signer;
    let sender: AccountAddress<"Solana">;
    let multisig: PublicKey;

    let tokenAccount: PublicKey;
    const mint = loadKeypair("tests/keys/mint.json");
    const tokenAddress = mint.publicKey.toBase58();

    const payer = loadKeypair("tests/keys/user.json");
    const owner = loadKeypair("tests/keys/mint.json");

    const { ctx, ...wc } = getWormholeContext();

    beforeAll(async () => {
        await airdrop(connection, payer.publicKey);
        signer = await getSolanaSignAndSendSigner(connection, payer);
        sender = Wormhole.parseAddress("Solana", signer.address());

        const mintLen = spl.getMintLen([]);
        const lamports = await connection.getMinimumBalanceForRentExemption(
            mintLen
        );

        const transaction = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: payer.publicKey,
                newAccountPubkey: mint.publicKey,
                space: mintLen,
                lamports,
                programId: TOKEN_PROGRAM,
            }),
            spl.createInitializeMintInstruction(
                mint.publicKey,
                9,
                owner.publicKey,
                null,
                TOKEN_PROGRAM
            )
        );

        const { blockhash } = await connection.getLatestBlockhash();

        transaction.feePayer = payer.publicKey;
        transaction.recentBlockhash = blockhash;

        await sendAndConfirmTransaction(connection, transaction, [
            payer,
            mint,
        ]);

        tokenAccount = await spl.createAssociatedTokenAccount(
            connection,
            payer,
            mint.publicKey,
            payer.publicKey,
            undefined,
            TOKEN_PROGRAM,
            spl.ASSOCIATED_TOKEN_PROGRAM_ID
        );

        await spl.mintTo(
            connection,
            payer,
            mint.publicKey,
            tokenAccount,
            owner,
            10_000_000n,
            undefined,
            undefined,
            TOKEN_PROGRAM
        );

        // contract client
        ntt = new SolanaNtt(
            "Devnet",
            "Solana",
            connection,
            {
                ...ctx.config.contracts,
                ntt: {
                    token: tokenAddress,
                    manager: NTT_ADDRESS.toBase58(),
                    transceiver: {
                        wormhole: NTT_ADDRESS.toBase58(),
                    },
                },
            },
            "3.0.0"
        );
    });

    describe("Burning", () => {
        beforeAll(async () => {
            multisig = await spl.createMultisig(
                connection,
                payer,
                [owner.publicKey, ntt.pdas.tokenAuthority()],
                1,
                Keypair.generate(),
                undefined,
                TOKEN_PROGRAM
            );
            await spl.setAuthority(
                connection,
                payer,
                mint.publicKey,
                owner,
                spl.AuthorityType.MintTokens,
                multisig,
                [],
                undefined,
                TOKEN_PROGRAM
            );

            // init
            const initTxs = ntt.initialize(sender, {
                mint: mint.publicKey,
                outboundLimit: 1000000n,
                mode: "burning",
                multisig,
            });
            await ssw(ctx, initTxs, signer);

            // register
            const registerTxs = ntt.registerWormholeTransceiver({
                payer: new SolanaAddress(payer.publicKey),
                owner: new SolanaAddress(payer.publicKey),
            });
            await ssw(ctx, registerTxs, signer);

            // Set Wormhole xcvr peer
            const setXcvrPeerTxs = ntt.setWormholeTransceiverPeer(
                wc.remoteXcvr,
                sender
            );
            await ssw(ctx, setXcvrPeerTxs, signer);

            // Set manager peer
            const setPeerTxs = ntt.setPeer(wc.remoteMgr, 18, 1000000n, sender);
            await ssw(ctx, setPeerTxs, signer);
        });

        test("Can send tokens", async () => {
            const amount = 100000n;
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

            // assert that released bitmap has transceiver bits set
            const outboxItemInfo = await ntt.program.account.outboxItem.fetch(
                outboxItem.publicKey
            );
            expect(outboxItemInfo.released.map.bitLength()).toBe(1);

            const [wormholeMessage] = PublicKey.findProgramAddressSync(
                [Buffer.from("message"), outboxItem.publicKey.toBytes()],
                NTT_ADDRESS
            );

            const unsignedVaa = await wc.coreBridge.parsePostMessageAccount(
                wormholeMessage
            );

            const tm = deserializePayload(
                "Ntt:WormholeTransfer",
                unsignedVaa.payload
            );

            // assert that amount is what we expect
            expect(tm.nttManagerPayload.payload.trimmedAmount)
                .toMatchObject({ amount: 10000n, decimals: 8 });

            // get from balance
            const balance = await connection.getTokenAccountBalance(tokenAccount);
            expect(balance.value.amount).toBe("9900000");
        });

        it("Can receive tokens", async () => {
            const emitter = new testing.mocks.MockEmitter(
                wc.remoteXcvr.address as UniversalAddress,
                "Ethereum",
                0n
            );

            const guardians = new testing.mocks.MockGuardians(0, [GUARDIAN_KEY]);
            const sender = Wormhole.parseAddress("Solana", signer.address());

            const sendingTransceiverMessage = {
                sourceNttManager: wc.remoteMgr.address as UniversalAddress,
                recipientNttManager: new UniversalAddress(
                    ntt.program.programId.toBytes()
                ),
                nttManagerPayload: {
                    id: encoding.bytes.encode("sequence1".padEnd(32, "0")),
                    sender: new UniversalAddress("FACE".padStart(64, "0")),
                    payload: {
                        trimmedAmount: {
                            amount: 10000n,
                            decimals: 8,
                        },
                        sourceToken: new UniversalAddress("FAFA".padStart(64, "0")),
                        recipientAddress: new UniversalAddress(payer.publicKey.toBytes()),
                        recipientChain: "Solana",
                        additionalPayload: new Uint8Array(),
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
            const redeemTxs = ntt.redeem([vaa], sender, multisig);

            await ssw(ctx, redeemTxs, signer);
        });

        it("Can mint independently", async () => {
            const dest = await spl.getOrCreateAssociatedTokenAccount(
                connection,
                payer,
                mint.publicKey,
                Keypair.generate().publicKey,
                false,
                undefined,
                undefined,
                TOKEN_PROGRAM
            );
            await spl.mintTo(
                connection,
                payer,
                mint.publicKey,
                dest.address,
                multisig,
                1,
                [owner],
                undefined,
                TOKEN_PROGRAM
            );
            const balance = await connection.getTokenAccountBalance(dest.address);
            expect(balance.value.amount.toString()).toBe("1");
        });
    });
});

function getWormholeContext() {
    const w = new Wormhole("Devnet", [SolanaPlatform], {
        chains: { Solana: { contracts: { coreBridge: CORE_BRIDGE_ADDRESS } } },
    });
    const remoteXcvr: ChainAddress = {
        chain: "Ethereum",
        address: new UniversalAddress(
            encoding.bytes.encode("transceiver".padStart(32, "\0"))
        ),
    };
    const remoteMgr: ChainAddress = {
        chain: "Ethereum",
        address: new UniversalAddress(
            encoding.bytes.encode("nttManager".padStart(32, "\0"))
        ),
    };
    const ctx: ChainContext<"Devnet", "Solana"> = w
        .getPlatform("Solana")
        .getChain("Solana", connection);

    const coreBridge = new SolanaWormholeCore("Devnet", "Solana", connection, {
        coreBridge: CORE_BRIDGE_ADDRESS,
    });
    return { ctx, coreBridge, remoteXcvr, remoteMgr };
}
