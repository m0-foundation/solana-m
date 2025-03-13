import { AnchorProvider, BN, getProvider, Program, Wallet } from "@coral-xyz/anchor";
import SolanaM, { EARN_PROGRAM } from "../../sdk/src";
import { Earn } from "../../sdk/src/earn/earn";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { loadKeypair } from "../test-utils";
import { MerkleTree } from "../merkle";
const EARN_IDL = require("../../sdk/src/earn/earn.json");

describe("SDK unit tests", () => {
    const client = new SolanaM("http://localhost:8899");
    const signer = loadKeypair("tests/keys/user.json");
    const earnerA = new Keypair();
    const earnerB = new Keypair();
    const mint = loadKeypair("tests/keys/mint.json");

    beforeAll(async () => {
        const provider = new AnchorProvider(
            new Connection("http://localhost:8899"),
            new Wallet(signer),
            { commitment: "processed" },
        );

        const earn = new Program<Earn>(EARN_IDL, EARN_PROGRAM, provider);

        const [globalAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("global")],
            earn.programId,
        )

        // create mint
        await spl.createMint(
            provider.connection,
            signer,
            signer.publicKey,
            null,
            9,
            mint,
            { skipPreflight: true },
            spl.TOKEN_2022_PROGRAM_ID,
        );

        // intialize the program
        await earn.methods
            .initialize(
                new PublicKey("mzeroZRGCah3j5xEWp2Nih3GDejSBbH1rbHoxDg8By6"),
                mint.publicKey,
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

        await earn.methods
            .propagateIndex(
                new BN(1_000_000_000_000),
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
    }, 10_000);

    test("no earners", async () => {
        const earners = await client.getRegistrarEarners();
        expect(earners).toEqual([]);
    })
})
