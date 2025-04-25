import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { EARN_ADDRESS_TABLE, EARN_ADDRESS_TABLE_DEVNET } from '.';

export class TransactionBuilder {
  private connection: Connection;
  private luts: AddressLookupTableAccount[];

  constructor(connection: Connection) {
    this.connection = connection;
    this.luts = [];
  }

  async buildTransaction(instructions: TransactionInstruction[], payer: PublicKey, priorityFee: number) {
    // fetch address tables
    const tables = await this._getAddressLookupTables();

    // build transaction
    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: (await this.connection.getLatestBlockhash(this.connection.commitment)).blockhash,
      instructions: instructions,
    });

    const transaction = new VersionedTransaction(message.compileToV0Message(tables));

    // simulate to get correct compute budget
    const simulation = await this.connection.simulateTransaction(transaction, {
      commitment: this.connection.commitment,
      sigVerify: false,
    });

    // add compute budget ixs
    message.instructions.unshift(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
      ComputeBudgetProgram.setComputeUnitLimit({
        units: Math.floor((simulation.value.unitsConsumed ?? 200_000) * 1.1),
      }),
    );

    // return versioned transaction with lookup table and compute budget ixs
    return new VersionedTransaction(message.compileToV0Message(tables));
  }

  private async _getAddressLookupTables() {
    if (this.luts.length === 0) {
      for (const address of [EARN_ADDRESS_TABLE_DEVNET, EARN_ADDRESS_TABLE]) {
        const lookupTableAccount = (await this.connection.getAddressLookupTable(address)).value;
        if (lookupTableAccount) {
          this.luts.push(lookupTableAccount);
        }
      }
    }
    return this.luts;
  }
}
