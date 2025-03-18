import { sha256 } from "js-sha256";
import bs58 from 'bs58'

export const deriveDiscriminator = (name: string, prefix = "account"): Buffer => {
    return Buffer.from(sha256.arrayBuffer(`${prefix}:${name}`).slice(0, 8));
}

export const b58 = (value: Buffer): string => {
    return bs58.encode(value)
}
