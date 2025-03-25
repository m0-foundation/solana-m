import { Command } from 'commander';

async function main() {
  const program = new Command();

  program.command('distribute').action(async () => {
    await removeEarners();

    await addEarners();
  });

  program.command('add earners').action(async () => {
    await addEarners();
  });

  program.command('remove earners').action(async () => {
    await addEarners();
  });

  await program.parseAsync(process.argv);
}

async function addEarners() {
  console.log('adding earners');
}

async function removeEarners() {
  console.log('removing earners');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
