import { Connection, GetProgramAccountsFilter, PublicKey } from '@solana/web3.js';
import {
    getStructDecoder,
    FixedSizeDecoder,
    fixDecoderSize,
    getBytesDecoder,
    getU8Decoder,
    getU64Decoder,
    ReadonlyUint8Array,
    getBooleanDecoder,
} from "@solana/codecs";
import { Address, getAddressDecoder } from "@solana/addresses";
import BN from 'bn.js';
import { PROGRAM_ID } from '.';
import { Earner } from './earner';

interface EarnManagerData {
    anchorDiscriminator: ReadonlyUint8Array;
    isActive: boolean
    feeBps: bigint
    feeTokenAccount: Address
    bump: number
}

export class EarnManager {
    private connection: Connection;

    manager: PublicKey
    pubkey: PublicKey
    isActive: boolean
    feeBps: number
    feeTokenAccount: PublicKey

    private decoder: FixedSizeDecoder<EarnManagerData> =
        getStructDecoder([
            ["anchorDiscriminator", fixDecoderSize(getBytesDecoder(), 8)],
            ["isActive", getBooleanDecoder()],
            ["feeBps", getU64Decoder()],
            ["feeTokenAccount", getAddressDecoder()],
            ["bump", getU8Decoder()],
        ]);

    private constructor(connection: Connection, manager: PublicKey, pubkey: PublicKey, data: Buffer) {
        this.connection = connection;
        this.manager = manager;
        this.pubkey = pubkey;


        const values = this.decoder.decode(data);
        this.isActive = values.isActive;
        this.feeBps = new BN(values.feeBps.toString()).toNumber();
        this.feeTokenAccount = new PublicKey(values.feeTokenAccount);
    }

    static async fromManagerAddress(connection: Connection, manager: PublicKey): Promise<EarnManager> {
        const [earnManagerAccount] = PublicKey.findProgramAddressSync(
            [Buffer.from("earn-manager"), manager.toBytes()],
            PROGRAM_ID,
        )
        const account = await connection.getAccountInfo(earnManagerAccount);
        if (!account) throw new Error(`Unable to find EarnManager account at ${earnManagerAccount}`);
        return new EarnManager(connection, manager, earnManagerAccount, account.data);
    }

    async getEarners(): Promise<Earner[]> {
        const filters: GetProgramAccountsFilter[] = [
            { memcmp: { offset: 9, bytes: this.manager.toBase58() } },
            { dataSize: 156 },
        ];
        const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, { filters });
        return accounts.map(({ account, pubkey }) => Earner.fromAccountData(this.connection, pubkey, account.data))
    }
}
