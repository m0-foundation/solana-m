import { AnchorProvider, BN, getProvider, Program, Wallet } from "@coral-xyz/anchor";
import SolanaM from "../../sdk/src";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { loadKeypair } from "../test-utils";
import { MerkleTree } from "../merkle";
import { Earn } from "../../target/types/earn";
import { PROGRAM_ID as EARN_PROGRAM } from "../../sdk/src";
import { Graph } from "../../sdk/src/graph";
const EARN_IDL = require("../../target/idl/earn.json");

describe("SDK unit tests", () => {
    // fix current time for testing
    Date.now = jest.fn(() => 1742215334 * 1000);

    const signer = loadKeypair("tests/keys/user.json");
    const earnerA = new Keypair();
    const earnerB = new Keypair();
    const mint = loadKeypair("tests/keys/mint.json");
    let earnerAccountA: PublicKey, earnerAccountB: PublicKey

    const client = new SolanaM("http://localhost:8899", 'processed');

    const provider = new AnchorProvider(
        new Connection("http://localhost:8899"),
        new Wallet(signer),
        { commitment: "processed" },
    );

    // anchor client for setting up the earn program
    const earn = new Program<Earn>(EARN_IDL, EARN_PROGRAM, provider);

    const [globalAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("global")],
        earn.programId,
    )

    beforeAll(async () => {
        // create mint
        const mintLen = spl.getMintLen([]);
        const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

        const tx = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: signer.publicKey,
                newAccountPubkey: mint.publicKey,
                space: mintLen,
                lamports,
                programId: spl.TOKEN_2022_PROGRAM_ID,
            }),
            spl.createInitializeMintInstruction(
                mint.publicKey,
                9,
                signer.publicKey,
                null,
                spl.TOKEN_2022_PROGRAM_ID
            ),

        );

        await provider.sendAndConfirm(tx, [signer, mint]);

        const ataTransaction = new Transaction()

        const atas = [earnerA, earnerB].map((earner) => {
            const earnerATA = spl.getAssociatedTokenAddressSync(
                mint.publicKey,
                earner.publicKey,
                true,
                spl.TOKEN_2022_PROGRAM_ID,
            );
            ataTransaction.add(
                spl.createAssociatedTokenAccountInstruction(
                    signer.publicKey,
                    earnerATA,
                    earner.publicKey,
                    mint.publicKey,
                    spl.TOKEN_2022_PROGRAM_ID,
                ),
            );
            // mint some tokens to the account
            ataTransaction.add(
                spl.createMintToInstruction(
                    mint.publicKey,
                    earnerATA,
                    signer.publicKey,
                    5000e9,
                    [],
                    spl.TOKEN_2022_PROGRAM_ID
                )
            )
            return earnerATA
        });

        await provider.sendAndConfirm(ataTransaction, [signer]);

        // intialize the program
        await earn.methods
            .initialize(
                mint.publicKey,
                new Keypair().publicKey,
                new BN(1_000_000_000_000),
                new BN(0)
            )
            .accounts({
                globalAccount,
                admin: signer.publicKey,
            })
            .signers([signer])
            .rpc();

        // populate the earner merkle tree with the initial earners
        const earnerMerkleTree = new MerkleTree([earnerA.publicKey]);
        const earnManagerMerkleTree = new MerkleTree([signer.publicKey]);

        for (let i = 0; i < 2; i++)
            await earn.methods
                .propagateIndex(
                    new BN(1_000_000_000_000).add(new BN(10_000_000_000 * i)),
                    earnerMerkleTree.getRoot(),
                    earnManagerMerkleTree.getRoot(),
                )
                .accounts({
                    signer: signer.publicKey,
                    globalAccount,
                    mint: mint.publicKey,
                })
                .signers([signer])
                .rpc();

        earnerAccountA = PublicKey.findProgramAddressSync(
            [Buffer.from("earner"), atas[0].toBytes()],
            earn.programId,
        )[0]
        earnerAccountB = PublicKey.findProgramAddressSync(
            [Buffer.from("earner"), atas[1].toBytes()],
            earn.programId,
        )[0]

        // add earner from root
        await earn.methods
            .addRegistrarEarner(
                earnerA.publicKey,
                earnerMerkleTree.getInclusionProof(earnerA.publicKey).proof
            )
            .accounts({
                signer: signer.publicKey,
                globalAccount,
                earnerAccount: earnerAccountA,
                userTokenAccount: atas[0],
            })
            .rpc();

        // add manager
        const [earnManagerAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("earn-manager"), signer.publicKey.toBytes()],
            earn.programId,
        )

        await earn.methods
            .configureEarnManager(
                new BN(10),
                earnManagerMerkleTree.getInclusionProof(signer.publicKey).proof,
            )
            .accounts({
                signer: signer.publicKey,
                globalAccount,
                earnManagerAccount,
                feeTokenAccount: atas[0],
            })
            .rpc();

        // add earners from root
        const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(earnerB.publicKey);

        await earn.methods
            .addEarner(
                earnerB.publicKey,
                proofs,
                neighbors
            )
            .accounts({
                signer: signer.publicKey,
                globalAccount,
                earnerAccount: earnerAccountB,
                userTokenAccount: atas[1],
                earnManagerAccount,
            })
            .rpc();
    });

    describe("rpc", () => {
        test("registrar earners", async () => {
            const earners = await client.getRegistrarEarners();
            expect(earners).toHaveLength(1);
            expect(earners[0].pubkey).toEqual(earnerAccountA);
        })

        test("get earn manager", async () => {
            const manager = await client.getManager(signer.publicKey);
            expect(manager.feeBps).toEqual(10);
        })

        test("manager earners", async () => {
            const manager = await client.getManager(signer.publicKey)
            const earners = await manager.getEarners();
            expect(earners).toHaveLength(1);
            expect(earners[0].pubkey).toEqual(earnerAccountB);
        })
    });

    describe("subgraph", () => {
        test("token holders", async () => {
            const graph = new Graph();
            const accounts = await graph.getTokenAccounts(3);
            expect(accounts).toHaveLength(3);
        })

        test("weighted balance", async () => {
            const graph = new Graph();
            const balance = await graph.getTimeWeightedBalance(new PublicKey("BpBCHhfSbR368nurxPizimYEr55JE7JWQ5aDQjYi3EQj"), 1741939199n);
            expect(balance).toEqual(591239337175n);
        })

        describe("weighted balance calculations", () => {
            // grab private function
            const fn = Graph["calculateTimeWeightedBalance"];

            test("0 balance", async () => {
                expect(fn(0n, 1742215334n, 1741939199n, [])).toEqual(0n);
            })
            test("no transfers balance", async () => {
                expect(fn(110n, 1742215334n, 1741939199n, [])).toEqual(110n);
            })
            test("one transfers halfway", async () => {
                expect(fn(100n, 150000n, 50000n, [{ amount: "50", ts: "100000" }])).toEqual(75n);
            })
            test("huge transfer before calculation", async () => {
                expect(fn(1000000n, 1500000n, 100n, [{ amount: "1000000", ts: "1499995" }])).toEqual(3n);
            })
            test("many transfers", async () => {
                const numTransfers = 50
                const transferAmount = 10

                // generate transfer data
                const transfers = [...Array(numTransfers)].map((_, i) => (
                    { amount: "10", ts: (100n + BigInt(i * transferAmount)).toString() }
                ))

                const upper = BigInt(transfers[0].ts) + 10n;
                const lower = BigInt(transfers[transfers.length - 1].ts) - 10n;

                // expect balance based on linear distribution of transfers
                const expected = 1000n - BigInt(numTransfers * transferAmount / 2)
                expect(fn(1000n, upper, lower, transfers)).toEqual(expected);
            })
            test("current balance is 0", async () => {
                expect(fn(0n, 200n, 100n, [{ amount: "-1000", ts: "150" }])).toEqual(500n);
            })
        })
    });

    describe("claim cycle", () => {
        test("validate claim cycle status", async () => {
            // check how much yield should be claimed
            const global = await earn.account.global.fetch(globalAccount, "processed")
            expect(global.maxSupply.toString()).toEqual("10000000000000");
            expect(global.maxYield.toString()).toEqual("100000000000");
            expect(global.distributed.toString()).toEqual("0");
        })
    });
})
