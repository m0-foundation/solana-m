import { Command } from 'commander';
import { Registrar } from '../../sdk/src/registrar';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';

export async function yieldCLI() {
  const program = new Command();

  program
    .command('distribute')
    .option('-k, --keypair <base64>', 'Signer keypair (base64)')
    .option('-r, --rpc [URL]', 'Solana RPC URL', 'https://api.devnet.solana.com')
    .option('-e, --evmRPC [URL]', 'Ethereum RPC URL', 'https://ethereum-sepolia-rpc.publicnode.com')
    .action(async ({ keypair, rpc, evmRPC }) => {
      const connection = new Connection(rpc);
      const signer = Keypair.fromSecretKey(Buffer.from(keypair, 'base64'));

      await removeEarners(connection, evmRPC);
      await distributeYield();
      await addEarners(connection, evmRPC, signer);
    });

  await program.parseAsync(process.argv);
}

async function distributeYield() {
  console.log('distributing yield');
}

async function addEarners(connection: Connection, evmRPC: string, signer: Keypair) {
  console.log('adding earners');
  const registrar = new Registrar(connection, evmRPC);
  const instructions = await registrar.buildMissingEarnersInstructions(signer.publicKey);
}

async function removeEarners(connection: Connection, evmRPC: string) {
  console.log('removing earners');
}

async function buildAndSendTransactions(
  connection: Connection,
  signer: Keypair,
  ixs: TransactionInstruction[],
): Promise<string> {
  // build
  const priorityFee = await getPriorityFee();
  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee });
  const t = new Transaction().add(computeBudgetIx, ...ixs);
  t.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  t.feePayer = signer.publicKey;

  // send
  const tx = new VersionedTransaction(t.compileMessage());
  tx.sign([signer]);
  const signature = await connection.sendTransaction(tx);

  // confirm
  const { lastValidBlockHeight, blockhash } = await connection.getLatestBlockhash();
  await connection.confirmTransaction({
    blockhash: blockhash,
    lastValidBlockHeight: lastValidBlockHeight,
    signature,
  });

  return signature;
}

async function getPriorityFee(): Promise<number> {
  const defaultFee = 250_000;
  try {
    const response = await fetch('https://quicknode.com/_gas-tracker?slug=solana');

    if (!response.ok) {
      console.warn(`failed to fetch priority fee data: ${response.status} ${response.statusText}`);
      return defaultFee;
    }

    const data = await response.json();

    if (!data?.sol?.per_compute_unit?.percentiles) {
      console.warn('invalid gas tracker response format');
      return defaultFee;
    }

    // use the 75th percentile as a reasonable default
    const priorityFee = data.sol.per_compute_unit.percentiles['75'];
    console.log(`got priority fee (75th percentile): ${priorityFee} microlamports per compute unit`);

    return priorityFee;
  } catch (error) {
    console.warn(`error fetching priority fee: ${error}`);
    return defaultFee;
  }
}

if (!process.argv[1].endsWith('jest')) {
  yieldCLI().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
