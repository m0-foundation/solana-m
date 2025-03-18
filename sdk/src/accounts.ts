import { fixDecoderSize, FixedSizeDecoder, getBooleanDecoder, getBytesDecoder, getStructDecoder, getU64Decoder, getU8Decoder, ReadonlyUint8Array, getOptionDecoder, Option } from "@solana/codecs";
import { Address, getAddressDecoder } from "@solana/addresses";

interface EarnManagerData {
    anchorDiscriminator: ReadonlyUint8Array;
    isActive: boolean
    feeBps: bigint
    feeTokenAccount: Address
    bump: number
}

export const earnManagerDecoder: FixedSizeDecoder<EarnManagerData> =
    getStructDecoder([
        ["anchorDiscriminator", fixDecoderSize(getBytesDecoder(), 8)],
        ["isActive", getBooleanDecoder()],
        ["feeBps", getU64Decoder()],
        ["feeTokenAccount", getAddressDecoder()],
        ["bump", getU8Decoder()],
    ]);

interface GlobalAccountData {
    admin: Address
    earnAuthority: Address
    mint: Address
    index: bigint
    timestamp: bigint
    claimCooldown: bigint
    maxSupply: bigint
    maxYield: bigint
    distributed: bigint
    claimComplete: boolean
    earnerMerkleRoot: ReadonlyUint8Array
    earnManagerMerkleRoot: ReadonlyUint8Array
    bump: number
}

export const globalDecoder: FixedSizeDecoder<GlobalAccountData> =
    getStructDecoder([
        ["anchorDiscriminator", fixDecoderSize(getBytesDecoder(), 8)],
        ["admin", getAddressDecoder()],
        ["earnAuthority", getAddressDecoder()],
        ["mint", getAddressDecoder()],
        ["index", getU64Decoder()],
        ["timestamp", getU64Decoder()],
        ["claimCooldown", getU64Decoder()],
        ["maxSupply", getU64Decoder()],
        ["maxYield", getU64Decoder()],
        ["distributed", getU64Decoder()],
        ["claimComplete", getBooleanDecoder()],
        ["earnerMerkleRoot", fixDecoderSize(getBytesDecoder(), 32)],
        ["earnManagerMerkleRoot", fixDecoderSize(getBytesDecoder(), 32)],
        ["bump", getU8Decoder()],
    ]);

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

export const earnerDecoder: FixedSizeDecoder<EarnerData> =
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
