import { PublicKey } from "@solana/web3.js"
import { ChainAddress } from "@wormhole-foundation/sdk-definitions"
import { utils } from "web3"

export const serializePayload = (id: string, payload: string, payer: PublicKey) => {
    // add payload len
    let customPayload = utils.encodePacked({ type: 'uint16', value: Buffer.from(payload.slice(2), 'hex').length }) + payload.slice(2)

    // nttManager payload
    return utils.encodePacked(
        { type: 'bytes32', value: Buffer.from(id.padEnd(32, "0")).toString('hex') }, // id 
        { type: 'bytes32', value: Buffer.from(payer.toBytes()).toString('hex') }, // sender 
    ) + customPayload.slice(2)
}

export const serializeTransfer = (amount: bigint, payer: PublicKey) => {
    return utils.encodePacked(
        { type: 'bytes4', value: '0x994e5454' }, // prefix 
        { type: 'uint8', value: 8 }, // decimals 
        { type: 'uint64', value: amount }, // amount
        { type: 'bytes32', value: "FAFA".padStart(64, "0") }, // source token
        { type: 'bytes32', value: Buffer.from(payer.toBytes()).toString('hex') }, // recipient address
        { type: 'uint16', value: 1 }, // recipient chain
        { type: 'uint16', value: 48 }, // additionalPayload len
        { type: 'bytes', value: Buffer.alloc(48).toString('hex') }, // additionalPayload
    )
}

export const serializeIndexUpdate = (index: bigint) => {
    return utils.encodePacked(
        { type: 'bytes4', value: '0x4d304954' }, // prefix 
        { type: 'uint128', value: index }, // index 
        { type: 'uint16', value: 1 }, // to_chain
    )
}

export const serializedMessage = (payload: string, remoteMgr: ChainAddress) => {
    // nttManager payload len
    let customPayload = utils.encodePacked({ type: 'uint16', value: Buffer.from(payload.slice(2), 'hex').length }) + payload.slice(2)

    // outer
    customPayload = utils.encodePacked(
        { type: 'bytes4', value: '0x9945ff10' }, // transeiver payload prefix
        { type: 'bytes32', value: Buffer.from(remoteMgr.address.toUint8Array()).toString('hex') }, // sourceNttManager 
        { type: 'bytes32', value: Buffer.from(new PublicKey("mZEroYvA3c4od5RhrCHxyVcs2zKsp8DTWWCgScFzXPr").toBytes()).toString('hex') }, // recipientNttManager 
    ) + customPayload.slice(2) + '0000'

    return Buffer.from(customPayload.slice(2), 'hex')
}