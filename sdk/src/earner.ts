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
    getOptionDecoder,
    Option,
    isSome
} from "@solana/codecs";
import { Address, getAddressDecoder } from "@solana/addresses";
import { PROGRAM_ID } from '.';

interface EarnerData {
    anchorDiscriminator: ReadonlyUint8Array;
    earnManager: Option<Address>
    recipientTokenAccount: Option<Address>
    lastClaimIndex: bigint
    lastClaimTimestamp: bigint
    isEarning: boolean
    bump: number
    user: Address
    userTokenAccount: Address
}

export class Earner {
    private connection: Connection;

    pubkey: PublicKey
    earnManager: PublicKey | null
    recipientTokenAccount: PublicKey | null
    lastClaimIndex: bigint
    lastClaimTimestamp: bigint
    isEarning: boolean
    user: PublicKey
    userTokenAccount: PublicKey

    private decoder: FixedSizeDecoder<EarnerData> =
        getStructDecoder([
            ["anchorDiscriminator", fixDecoderSize(getBytesDecoder(), 8)],
            ['earnManager', getOptionDecoder(getAddressDecoder(), { noneValue: 'zeroes' })],
            ['recipientTokenAccount', getOptionDecoder(getAddressDecoder(), { noneValue: 'zeroes' })],
            ['lastClaimIndex', getU64Decoder()],
            ['lastClaimTimestamp', getU64Decoder()],
            ['isEarning', getBooleanDecoder()],
            ['bump', getU8Decoder()],
            ['user', getAddressDecoder()],
            ['userTokenAccount', getAddressDecoder()],
        ]);

    private constructor(connection: Connection, pubkey: PublicKey, data: Buffer) {
        this.connection = connection;
        this.pubkey = pubkey;

        const values = this.decoder.decode(data);
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
}
