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
            )
        );

        await provider.sendAndConfirm(tx, [signer, mint]);

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

        const earnerATA = await spl.createAssociatedTokenAccount(
            provider.connection,
            signer,
            mint.publicKey,
            signer.publicKey,
            undefined,
            spl.TOKEN_2022_PROGRAM_ID,
        );

        const [earnerAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("earner"), earnerATA.toBytes()],
            earn.programId,
        )

        // add earner from root
        await earn.methods
            .addRegistrarEarner(
                earnerA.publicKey,
                earnerMerkleTree.getInclusionProof(earnerA.publicKey).proof
            )
            .accounts({
                signer: signer.publicKey,
                globalAccount,
                earnerAccount,
                userTokenAccount: earnerATA,
            })
            .rpc();
    });

    test("no earners", async () => {
        const earners = await client.getRegistrarEarners();
        expect(earners).toEqual([]);
    })
})
