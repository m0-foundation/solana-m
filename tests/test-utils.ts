import path from "path";
import { Commitment, GetAccountInfoConfig, Keypair, PublicKey, SendOptions, Signer, Transaction, TransactionConfirmationStrategy, VersionedTransaction } from "@solana/web3.js";
import fs from "fs";
import { LiteSVMProvider } from "anchor-litesvm";
import { FailedTransactionMetadata, LiteSVM } from "litesvm";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Wallet } from "@coral-xyz/anchor";

export function loadKeypair(filePath: string): Keypair {
  const fullPath = path.resolve(filePath);
  const secretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(fullPath, "utf-8"))
  );
  return Keypair.fromSecretKey(secretKey);
}

export function toFixedSizedArray(buffer: Buffer, size: number): number[] {
  const array = new Array(size).fill(0);
  buffer.forEach((value, index) => {
    array[index] = value;
  });
  return array;
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Extend LiteSVMProvider with missing web3.js methods
export class LiteSVMProviderExt extends LiteSVMProvider {
  constructor(public client: LiteSVM, wallet?: Wallet) {
    super(client, wallet);

    this.connection.getLatestBlockhash = async () => ({ blockhash: this.client.latestBlockhash(), lastValidBlockHeight: 10 })
    this.connection.getSlot = async (_) => Number(this.client.getClock().slot)

    // litesvm only has sendAndConfirm which will throw on error so we can assume confirmTransaction will always succeed
    this.connection.sendTransaction = async (tx: Transaction | VersionedTransaction, s?: Signer[] | SendOptions, _?: SendOptions) => this.sendAndConfirm(tx, s as Signer[])
    this.connection.confirmTransaction = async (_strat: TransactionConfirmationStrategy | string, _?: Commitment) => ({
      context: { slot: await this.connection.getSlot() },
      value: { err: null }
    })

    // send transaction and thow on error (because transaction immediately confirm)
    this.connection.sendRawTransaction = async (rawTransaction: Buffer, options?: SendOptions): Promise<string> => {
      let tx: Transaction | VersionedTransaction
      let signature: string
      try {
        tx = Transaction.from(rawTransaction)
        signature = bs58.encode(tx.signature)
      } catch {
        tx = VersionedTransaction.deserialize(rawTransaction)
        signature = bs58.encode(tx.signatures[0])
      }

      // send and check for error
      const result = this.client.sendTransaction(tx);
      if (result instanceof FailedTransactionMetadata) {
        console.error(result.meta().logs());
        throw new Error(result.err().toString());
      }

      return signature
    }

    // these are expected to return null and not throw an error if uninitialized
    this.connection.getAccountInfo = async (pk: PublicKey, _?: Commitment | GetAccountInfoConfig) => {
      const accountInfoBytes = this.client.getAccount(pk);
      return accountInfoBytes ? { ...accountInfoBytes, data: Buffer.from(accountInfoBytes.data ?? []) } : null;
    }
    this.connection.getAccountInfoAndContext = async (pk: PublicKey, _?: Commitment | GetAccountInfoConfig | undefined) => ({
      context: { slot: Number(this.client.getClock().slot) },
      value: await this.connection.getAccountInfo(pk),
    });
  }
}
