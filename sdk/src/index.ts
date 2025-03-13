import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Earn } from './earn/earn';
const EARN_IDL = require("./earn/earn.json");

export const EARN_PROGRAM = new PublicKey("MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c");

export class SolanaM {
    private connection: Connection;
    private program: Program<Earn>;

    constructor(rpcUrl: string) {
        this.connection = new Connection(rpcUrl);

        const provider = new AnchorProvider(this.connection, new DummyWallet(), {});
        this.program = new Program<Earn>(EARN_IDL, EARN_PROGRAM, provider);
    }

    async getRegistrarEarners() {
        return await this.program.account.earner.all()
    }
}

// dummy wallet for the anchor provider
// we only use anchor to build instructions and parse accounts
class DummyWallet {
    publicKey = PublicKey.default;
    async signTransaction(tx: any) { return tx; }
    async signAllTransactions(txs: any[]) { return txs }
}

export default SolanaM;
