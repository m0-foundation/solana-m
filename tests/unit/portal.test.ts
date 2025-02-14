import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { fromWorkspace, LiteSVMProvider } from "anchor-litesvm";

const PROGRAM_ID = new PublicKey("mZEroYvA3c4od5RhrCHxyVcs2zKsp8DTWWCgScFzXPr")

describe("Portal unit tests", () => {
    const svm = fromWorkspace("")
        .withSplPrograms()
        .withBuiltins()
        .withSysvars()
        .withBlockhashCheck(false);

    const provider = new LiteSVMProvider(svm);
    const admin = new Keypair();
    svm.airdrop(admin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

    describe("inbound messages", () => {
        it("receive", async () => {

        });

        it("redeem", async () => {

        });

        it("release inbound", async () => {

        });
    });

    describe("outbound messages", () => {
        it("transfer burn", async () => {

        });

        it("release outbound", async () => {

        });
    });
})
