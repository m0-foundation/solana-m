import { AnchorProvider, BN, getProvider, Program, Wallet } from "@coral-xyz/anchor";
import SolanaM from "../../sdk/src";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { loadKeypair } from "../test-utils";
import { MerkleTree } from "../merkle";
import { Earn } from "../../target/types/earn";
import { PROGRAM_ID as EARN_PROGRAM } from "../../sdk/src/generated";
const EARN_IDL = require("../../target/idl/earn.json");

describe("SDK unit tests", () => {
    const client = new SolanaM("http://localhost:8899", 'processed');
    const connection = new Connection("http://localhost:8899");

    const signer = loadKeypair("tests/keys/user.json");
    const earnerA = new Keypair();
    const earnerB = new Keypair();
    const mint = loadKeypair("tests/keys/mint.json");

    let earnerAccountA, earnerAccountB: PublicKey

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
            return earnerATA
        });

        await provider.sendAndConfirm(ataTransaction, [signer]);

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
})
