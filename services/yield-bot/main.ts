import { Command } from 'commander';

async function main() {
  const program = new Command();

  program.command('distribute').action(async () => {
    console.log('hello world');
  });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
