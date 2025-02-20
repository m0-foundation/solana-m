import * as spl from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
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
    SolanaSendSigner,
    SolanaUnsignedTransaction,
} from "@wormhole-foundation/sdk-solana";
import { SolanaWormholeCore } from "@wormhole-foundation/sdk-solana-core";
import { SolanaNtt } from "@wormhole-foundation/sdk-solana-ntt";
import { LiteSVMProviderExt, loadKeypair } from "../test-utils";
import { fromWorkspace } from "anchor-litesvm";
import { createAssociatedTokenAccountInstruction, createMintToInstruction, createSetAuthorityInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";

const TOKEN_PROGRAM = spl.TOKEN_2022_PROGRAM_ID;
const GUARDIAN_KEY = "cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0";
const CORE_BRIDGE_ADDRESS = "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth";
const NTT_ADDRESS = new PublicKey("mZEroYvA3c4od5RhrCHxyVcs2zKsp8DTWWCgScFzXPr")

const WORMHOLE_PID = new PublicKey("worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth")
const WORMHOLE_BRIDGE_CONFIG = new PublicKey("2yVjuQwpsvdsrywzsJJVs9Ueh4zayyo5DYJbBNc3DDpn")
const WORMHOLE_BRIDGE_FEE_COLLECTOR = new PublicKey("9bFNrXNb2WTx8fMHXCheaZqkLZ3YCCaiqTftHxeintHy")

describe("portal", () => {
    let ntt: SolanaNtt<"Devnet", "Solana">;
    let signer: Signer;
    let sender: AccountAddress<"Solana">;
    let multisig = Keypair.generate();

    let tokenAccount: PublicKey;
    const mint = loadKeypair("tests/keys/mint.json");
    const tokenAddress = mint.publicKey.toBase58();

    const payer = loadKeypair("tests/keys/user.json");
    const owner = loadKeypair("tests/keys/mint.json");

    const svm = fromWorkspace("")
        .withSplPrograms()
        .withBuiltins()
        .withSysvars()
        .withBlockhashCheck(false)

    // Wormhole program
    svm.addProgramFromFile(WORMHOLE_PID, "tests/accounts/core_bridge.so")

    // Add necessary wormhole accounts
    svm.setAccount(WORMHOLE_BRIDGE_CONFIG, {
        executable: false,
        owner: WORMHOLE_PID,
        lamports: 1057920,
        data: Buffer.from("BAAAACQWCRUAAAAAgFEBAGQAAAAAAAAA", "base64"),
    })

    svm.setAccount(WORMHOLE_BRIDGE_FEE_COLLECTOR, {
        executable: false,
        owner: new PublicKey("11111111111111111111111111111111"),
        lamports: 2350640070,
        data: Buffer.from([]),
    })

    const gaurdianSet0 = new PublicKey("DS7qfSAgYsonPpKoAjcGhX9VFjXdGkiHjEDkTidf8H2P")
    svm.setAccount(gaurdianSet0, {
        executable: false,
        owner: WORMHOLE_PID,
        lamports: 21141440,
        data: Buffer.from("AAAAAAEAAAC++kKdV80Yt/ik2RotqatK8F0PvkPJm2EAAAAA", "base64"),
    })

    const programData = new PublicKey("ErL2HKJaMbQvGsLBtCR8tpLJTYfPaF14V81KRCxPUtd9")
    svm.setAccount(programData, {
        executable: false,
        owner: new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
        lamports: 21141440,
        data: Buffer.from([]),
    })

    // Create an anchor provider from the liteSVM instance
    const provider = new LiteSVMProviderExt(svm, new NodeWallet(payer));
    const connection = provider.connection;

    const { ctx, ...wc } = getWormholeContext(connection);

    beforeAll(async () => {
        svm.airdrop(payer.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
        signer = new SolanaSendSigner(connection, "Solana", payer, false, {});
        sender = Wormhole.parseAddress("Solana", signer.address());

        const mintLen = spl.getMintLen([]);
        const lamports = await connection.getMinimumBalanceForRentExemption(
            mintLen
        );

        const tx = new Transaction().add(
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

        await provider.sendAndConfirm(tx, [payer, mint]);

        tokenAccount = spl.getAssociatedTokenAddressSync(
            mint.publicKey,
            payer.publicKey,
            false,
            TOKEN_PROGRAM,
        );

        // Mint tokens to payer
        const mintTx = new Transaction().add(
            spl.createAssociatedTokenAccountInstruction(
                payer.publicKey,
                tokenAccount,
                payer.publicKey,
                mint.publicKey,
                TOKEN_PROGRAM,
            ),
            createMintToInstruction(
                mint.publicKey,
                tokenAccount,
                owner.publicKey,
                10_000_000n,
                undefined,
                TOKEN_PROGRAM,
            )
        );

        await provider.sendAndConfirm(mintTx, [payer, owner]);

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
            // Create multisig and set authority
            const multiSigTx = new Transaction().add(
                SystemProgram.createAccount({
                    fromPubkey: payer.publicKey,
                    newAccountPubkey: multisig.publicKey,
                    space: spl.MULTISIG_SIZE,
                    lamports: await spl.getMinimumBalanceForRentExemptMultisig(connection),
                    programId: TOKEN_PROGRAM,
                }),
                spl.createInitializeMultisigInstruction(
                    multisig.publicKey,
                    [owner.publicKey, ntt.pdas.tokenAuthority()],
                    1,
                    TOKEN_PROGRAM,
                ),
                createSetAuthorityInstruction(
                    mint.publicKey,
                    owner.publicKey,
                    spl.AuthorityType.MintTokens,
                    multisig.publicKey,
                    [],
                    TOKEN_PROGRAM,
                )
            );

            await provider.sendAndConfirm(multiSigTx, [payer, owner, multisig]);

            // init
            const initTxs = ntt.initialize(sender, {
                mint: mint.publicKey,
                outboundLimit: 1000000n,
                mode: "burning",
                multisig: multisig.publicKey,
            });
            async function* onlyInit() {
                yield (await initTxs.next()).value as SolanaUnsignedTransaction<"Devnet", "Solana">
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
            const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
            const parsedTokenAccount = spl.unpackAccount(tokenAccount, tokenAccountInfo, TOKEN_PROGRAM);
            expect(parsedTokenAccount.amount).toBe(9900000n);
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
            const redeemTxs = ntt.redeem([vaa], sender, multisig.publicKey);

            await ssw(ctx, redeemTxs, signer);
        });

        it("Can mint independently", async () => {
            const recipient = Keypair.generate()
            const associatedToken = getAssociatedTokenAddressSync(
                mint.publicKey,
                recipient.publicKey,
                false,
                TOKEN_PROGRAM,
            );

            const tx = new Transaction().add(
                createAssociatedTokenAccountInstruction(
                    payer.publicKey,
                    associatedToken,
                    recipient.publicKey,
                    mint.publicKey,
                    TOKEN_PROGRAM,
                ),
                createMintToInstruction(
                    mint.publicKey,
                    associatedToken,
                    multisig.publicKey,
                    1,
                    [owner],
                    TOKEN_PROGRAM,
                )
            )

            await provider.sendAndConfirm(tx, [payer, owner]);

            const tokenAccountInfo = await connection.getAccountInfo(associatedToken);
            const parsedTokenAccount = spl.unpackAccount(tokenAccount, tokenAccountInfo, TOKEN_PROGRAM);
            expect(parsedTokenAccount.amount).toBe(1n);
        });
    });
});

function getWormholeContext(connection: Connection) {
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
