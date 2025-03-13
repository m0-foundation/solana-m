const { Solita } = require('@metaplex-foundation/solita');
const idl = require('../target/idl/earn.json');

const PROGRAM_ID = 'MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c';

async function generateTypeScriptSDK() {
    idl.metadata = { ...idl.metadata, address: PROGRAM_ID };
    const gen = new Solita(idl, { formatCode: true });
    await gen.renderAndWriteTo('src/generated');
}

generateTypeScriptSDK().catch((err) => {
    console.error(err)
    process.exit(1)
})
