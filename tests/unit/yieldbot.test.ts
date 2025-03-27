import { Keypair, PublicKey } from '@solana/web3.js';
import nock from 'nock';
import { yieldCLI } from '../../services/yield-bot/main';

describe('Yield bot tests', () => {
  const earner = Keypair.generate();
  mockRequestData(earner.publicKey);

  test('run bot', async () => {
    const signer = Keypair.generate();
    const secret = Buffer.from(signer.secretKey).toString('base64');

    // mock command-line arguments
    process.argv = ['node', 'maint.ts', 'distribute'];
    process.argv.push('-k', secret);
    process.argv.push('-e', 'https://sepolia.dummy.com');
    process.argv.push('-r', 'http://localhost:8899');
    process.argv.push('--dryRun');

    await yieldCLI();
  }, 60_000);
});

/*
 * Mocks the request data for the yield bot
 */
function mockRequestData(earner: PublicKey) {
  nock('https://sepolia.dummy.com')
    .post(
      '/',
      // getList (earners)
      (body) => body.params?.[0].data === '0x2d229202736f6c616e612d6561726e657273000000000000000000000000000000000000',
    )
    .reply(200, {
      id: 13,
      jsonrpc: '2.0',
      result:
        '0x000000000000000000000000000000000000000000000000000000000000002' +
        '00000000000000000000000000000000000000000000000000000000000000001' +
        earner.toBuffer().toString('hex'),
    })
    .persist();

  nock('https://quicknode.com')
    .get('/_gas-tracker')
    .query({ slug: 'solana' })
    .reply(200, { sol: { per_compute_unit: { percentiles: { '75': 590909 } } } })
    .persist();

  // for all rpc reponses
  const context = { apiVersion: '2.2.0', slot: 369962085 };

  // rpc request body matcher => rpc response
  const rpcMocks: [nock.RequestBodyMatcher, any][] = [
    [
      (body) => body.method === 'getLatestBlockhash',
      {
        context,
        value: {
          blockhash: '7rCouaLD532r6wyXLsnx9mQGf4A7eMiWcnFd9SWu3EPF',
          lastValidBlockHeight: 357940737,
        },
      },
    ],
    [
      (body) => body.method === 'getAccountInfo' && body.params?.[0] === 'GNc6kVU8B4ZdDk6wpzUyNUo7Zs42MBLKVRz64Zojfpje', // global account
      {
        context,
        value: {
          data: [
            'p+joschscn+z3HtcE1xihhozJWJpdvNsPnG5FAKFUFeJ7wZJIrxP9tngeGCkwV0UDXPudfVjEKHITeTFP5nuprxPN+FVNxjkC4a+Zr/OtMHX6Se8xNAUvg8oY6ud+F/aYQhRtk29CuXSfnxW6QAAAJcLz2cAAAAALAEAAAAAAAB/hB4AAAAAAAAAAAAAAAAAAAAAAAAAAAAA4s+HOzdKtcdPgH3ruU3IQEvLtAydCoj5j1nDukIsog0TG0E5aKgG7NsJGiMoiB8VGXMnMISc8luMk8M87uB6Vf4=',
            'base64',
          ],
          executable: false,
          lamports: 2408160,
          owner: 'MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c',
          rentEpoch: 18446744073709551615,
          space: 218,
        },
      },
    ],
    [
      (body) => body.method === 'getAccountInfo' && body.params?.[0] === 'mzeroZRGCah3j5xEWp2Nih3GDejSBbH1rbHoxDg8By6', // mint
      {
        context,
        value: {
          data: [
            'AQAAAAt+HmYkvrxuIRc9WMtEGFHidulJDPbDH2C3PqhmCtaMP3cbAAAAAAAGAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARIAQACz3HtcE1xihhozJWJpdvNsPnG5FAKFUFeJ7wZJIrxP9guGvma/zrTB1+knvMTQFL4PKGOrnfhf2mEIUbZNvQrlDgBAALPce1wTXGKGGjMlYml282w+cbkUAoVQV4nvBkkivE/2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAEEAs9x7XBNcYoYaMyViaXbzbD5xuRQChVBXie8GSSK8T/YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATAMIAs9x7XBNcYoYaMyViaXbzbD5xuRQChVBXie8GSSK8T/YLhr5mv860wdfpJ7zE0BS+Dyhjq534X9phCFG2Tb0K5QgAAABNIGJ5IE1eMAEAAABNNAAAAGh0dHBzOi8vZXRoZXJzY2FuLmlvL3Rva2VuL2ltYWdlcy9tMHRva2VuX25ld18zMi5wbmcBAAAAAwAAAGV2bSoAAAAweDg2NkEyQkY0RTU3MkNiY0YzN0Q1MDcxQTdhNTg1MDNCZmIzNmJlMWI=',
            'base64',
          ],
          executable: false,
          lamports: 4851120,
          owner: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
          rentEpoch: 18446744073709551615,
          space: 569,
        },
      },
    ],
    [
      (body) => body.method === 'simulateTransaction',
      {
        context,
        value: {
          err: null,
          accounts: null,
          logs: [],
          unitsConsumed: 2366,
        },
      },
    ],
    [
      (body) => body.method === 'getProgramAccounts' && body.params?.[1].filters?.[0].memcmp.bytes === 'gZH8R1wytJi', // earners
      [],
    ],
  ];

  // mock all rpc requests
  for (const [matcher, result] of rpcMocks) {
    nock('http://localhost:8899')
      .post('/', matcher)
      .reply(200, {
        jsonrpc: '2.0',
        result,
        id: 'b509d315-7773-49e0-87ce-4b10524c7515',
      })
      .persist();
  }
}
