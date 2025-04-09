import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { EARN_ADDRESS_TABLE } from '.';

export const buildTransaction = async (
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  priorityFee: number,
) => {
  // fetch address table
  const lookupTableAccount = (await connection.getAddressLookupTable(EARN_ADDRESS_TABLE)).value;
  const tables = lookupTableAccount ? [lookupTableAccount] : [];

  // build transaction
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: (await connection.getLatestBlockhash(connection.commitment)).blockhash,
    instructions: instructions,
  });

  const transaction = new VersionedTransaction(message.compileToV0Message(tables));

  // simulate to get correct compute budget
  const simulation = await connection.simulateTransaction(transaction, {
    commitment: connection.commitment,
    sigVerify: false,
  });

  // add compute budget ixs
  message.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: (simulation.value.unitsConsumed ?? 200_000) * 1.1 }),
  );

  // return versioned transaction with lookup table and compute budget ixs
  return new VersionedTransaction(message.compileToV0Message(tables));
};
