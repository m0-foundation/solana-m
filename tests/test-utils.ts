import path from "path";
import { Commitment, Keypair, LAMPORTS_PER_SOL, PublicKey, RpcResponseAndContext, SendOptions, SignatureResult, Signer, Transaction, TransactionConfirmationStrategy, VersionedTransaction } from "@solana/web3.js";
import fs from "fs";
import { LiteSVMProvider } from "anchor-litesvm";
import { LiteSVM } from "litesvm";

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

// Extend LiteSVMProvider with missing web3.js methods
export class LiteSVMProviderExt extends LiteSVMProvider {
  constructor(public client: LiteSVM) {
    super(client);

    this.connection.getLatestBlockhash = async () => ({ blockhash: this.client.latestBlockhash(), lastValidBlockHeight: 10 })
    this.connection.getSlot = async (_) => Number(this.client.getClock().slot)
    this.connection.sendTransaction = async (
      transaction: Transaction | VersionedTransaction,
      signers?: Signer[] | SendOptions,
      options?: SendOptions,
    ): Promise<string> => {
      console.log("signers", (signers as Signer[]).map((s) => s.publicKey.toBase58()))
      return this.sendAndConfirm(transaction, signers as Signer[])
    }
    this.connection.confirmTransaction = async (strategy: TransactionConfirmationStrategy | string, commitment?: Commitment): Promise<RpcResponseAndContext<SignatureResult>> => {
      // transactions sent to litesvm are confirmed immediately
      return {
        context: { slot: await this.connection.getSlot() },
        value: { err: null }
      }
    }
  }
}
