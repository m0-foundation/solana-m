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

interface ParsedOptions {
  signer: Keypair;
  connection: Connection;
  evmRPC: string;
  skipConfirm: boolean;
}

export async function yieldCLI() {
  const program = new Command();

  program
    .command('distribute')
    .option('-k, --keypair <base64>', 'Signer keypair (base64)')
    .option('-r, --rpc [URL]', 'Solana RPC URL', 'https://api.devnet.solana.com')
    .option('-e, --evmRPC [URL]', 'Ethereum RPC URL', 'https://ethereum-sepolia-rpc.publicnode.com')
    .option('-s, --skipConfirm [bool]', 'Skip transaction confirmation', false)
    .action(async ({ keypair, rpc, evmRPC, skipConfirm }) => {
      const options = {
        signer: Keypair.fromSecretKey(Buffer.from(keypair, 'base64')),
        connection: new Connection(rpc),
        evmRPC,
        skipConfirm,
      };

      await removeEarners(options);
      await distributeYield(options);
      await addEarners(options);
    });

  await program.parseAsync(process.argv);
}

async function distributeYield(opt: ParsedOptions) {
  console.log('distributing yield');
}

async function addEarners(opt: ParsedOptions) {
  console.log('adding earners');
  const registrar = new Registrar(opt.connection, opt.evmRPC);
  const instructions = await registrar.buildMissingEarnersInstructions(opt.signer.publicKey);

  if (instructions.length === 0) {
    console.log('no earners to add');
    return;
  }

  const signature = await buildAndSendTransaction(opt, instructions);
  console.log(`added earners: ${signature}`);
}

async function removeEarners(opt: ParsedOptions) {
  console.log('removing earners');
  const registrar = new Registrar(opt.connection, opt.evmRPC);
  const instructions = await registrar.buildRemovedEarnersInstructions(opt.signer.publicKey);

  if (instructions.length === 0) {
    console.log('no earners to remove');
    return;
  }

  const signature = await buildAndSendTransaction(opt, instructions);
  console.log(`removed earners: ${signature}`);
}

async function buildAndSendTransaction(
  { connection, signer, skipConfirm }: ParsedOptions,
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
  if (!skipConfirm) {
    const { lastValidBlockHeight, blockhash } = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: blockhash,
      lastValidBlockHeight: lastValidBlockHeight,
      signature,
    });
  }

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
