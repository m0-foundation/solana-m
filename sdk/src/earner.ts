import { Connection, PublicKey } from '@solana/web3.js';
import { isSome } from "@solana/codecs";
import { PROGRAM_ID } from '.';
import { earnerDecoder } from './accounts';
import { Claim, Graph } from './graph';


export class Earner {
    private connection: Connection;
    private graph: Graph;

    pubkey: PublicKey
    earnManager: PublicKey | null
    recipientTokenAccount: PublicKey | null
    lastClaimIndex: bigint
    lastClaimTimestamp: bigint
    isEarning: boolean
    user: PublicKey
    userTokenAccount: PublicKey


    private constructor(connection: Connection, pubkey: PublicKey, data: Buffer) {
        this.connection = connection;
        this.graph = new Graph();
        this.pubkey = pubkey;

        const values = earnerDecoder.decode(data);
        this.earnManager = null;
        this.recipientTokenAccount = null;
        this.lastClaimIndex = values.lastClaimIndex;
        this.lastClaimTimestamp = values.lastClaimTimestamp;
        this.isEarning = values.isEarning;
        this.user = new PublicKey(values.user);
        this.userTokenAccount = new PublicKey(values.userTokenAccount);

        if (isSome(values.earnManager)) {
            this.earnManager = new PublicKey(values.earnManager.value.toString());
        }
        if (isSome(values.recipientTokenAccount)) {
            this.recipientTokenAccount = new PublicKey(values.recipientTokenAccount.value.toString());
        }
    }

    static async fromTokenAccount(connection: Connection, tokenAccount: PublicKey): Promise<Earner> {
        const [earnerAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("earner"), tokenAccount.toBytes()],
            PROGRAM_ID,
        )
        const account = await connection.getAccountInfo(earnerAccount);
        if (!account) throw new Error(`Unable to find Earner account for Account ${tokenAccount}`);
        return new Earner(connection, earnerAccount, account.data);
    }

    static fromAccountData(connection: Connection, pubkey: PublicKey, data: Buffer): Earner {
        return new Earner(connection, pubkey, data);
    }

    async getHistoricalClaims(): Promise<Claim[]> {
        return await this.graph.getHistoricalClaims(this.userTokenAccount);
    }
}
