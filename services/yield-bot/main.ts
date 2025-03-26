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
import EarnAuthority from '../../sdk/src/earn_auth';

interface ParsedOptions {
  signer: Keypair;
  connection: Connection;
  evmRPC: string;
  dryRun: boolean;
}

// entrypoint for the yield bot command
export async function yieldCLI() {
  const program = new Command();

  program
    .command('distribute')
    .option('-k, --keypair <base64>', 'Signer keypair (base64)')
    .option('-r, --rpc [URL]', 'Solana RPC URL', 'https://api.devnet.solana.com')
    .option('-e, --evmRPC [URL]', 'Ethereum RPC URL', 'https://ethereum-sepolia-rpc.publicnode.com')
    .option('-d, --dryRun [bool]', 'Build and simulate transactions without sending them', false)
    .action(async ({ keypair, rpc, evmRPC, dryRun }) => {
      let signer: Keypair;
      try {
        signer = Keypair.fromSecretKey(Buffer.from(JSON.parse(keypair)));
      } catch {
        signer = Keypair.fromSecretKey(Buffer.from(keypair, 'base64'));
      }

      const options = {
        signer,
        connection: new Connection(rpc),
        evmRPC,
        dryRun,
      };

      await removeEarners(options);
      await distributeYield(options);
      await addEarners(options);
    });

  await program.parseAsync(process.argv);
}

async function distributeYield(opt: ParsedOptions) {
  console.log('distributing yield');

  // get all earners on the earn program
  const auth = await EarnAuthority.load(opt.connection);
  const earners = await auth.getAllEarners();

  // build claim instructions
  const claimIxs = [];
  for (const earner of earners) {
    console.log(`claiming yield for ${earner.pubkey.toBase58()}`);
    claimIxs.push(await auth.buildClaimInstruction(earner));
  }

  // verify that there are no reverts and claims do not exceed max yield
  const distributed = await auth.simulateAndValidateClaimIxs(claimIxs);
  console.log(`distributing ${distributed} M in yield`);

  if (opt.dryRun) {
    console.log(`claims transaction: ${await buildAndSendTransaction(opt, claimIxs)}`);
    return;
  }

  // send all the claims
  const priorityFee = await getPriorityFee();
  const signatures = await auth.sendClaimInstructions(claimIxs, opt.signer, priorityFee, true);
  console.log(`yield distributed: ${signatures}`);
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
  console.log(`added ${instructions.length} earners: ${signature}`);
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
  console.log(`removed ${instructions.length} earners: ${signature}`);
}

async function buildAndSendTransaction(
  { connection, signer, dryRun }: ParsedOptions,
  ixs: TransactionInstruction[],
): Promise<string> {
  // build
  const priorityFee = await getPriorityFee();
  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee });
  const t = new Transaction().add(computeBudgetIx, ...ixs);
  t.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  t.feePayer = signer.publicKey;
  const tx = new VersionedTransaction(t.compileMessage());

  // simulate
  const result = await connection.simulateTransaction(tx);
  if (result.value.err) {
    throw new Error(`Transaction simulation failed: ${result.value.err}`);
  }

  if (dryRun) {
    return tx.serialize().toString();
  }

  // send
  tx.sign([signer]);
  const signature = await connection.sendTransaction(tx, { skipPreflight: true });

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

// do not run the cli if this is being imported by jest
if (!process.argv[1].endsWith('jest')) {
  yieldCLI().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
