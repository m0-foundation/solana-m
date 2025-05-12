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

const DEFAULT_COMPUTE_BUDGET = 500_000;

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
    let unitsConsumed = DEFAULT_COMPUTE_BUDGET;
    try {
      const simulation = await this.connection.simulateTransaction(transaction, {
        commitment: this.connection.commitment,
        replaceRecentBlockhash: true,
        sigVerify: false,
      });
      if (simulation.value.unitsConsumed) {
        unitsConsumed = Math.floor(simulation.value.unitsConsumed * 1.1);
      }
    } catch (e) {
      console.error('simulation error for compute', e);
    }

    // add compute budget ixs
    message.instructions.unshift(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: unitsConsumed }),
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
