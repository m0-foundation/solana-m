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

    yieldCLI();
  });
});

// Mock subgraph and rpc data for testing
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

  nock('https://quicknode.com/_gas-tracker?slug=solana')
    .get('/')
    .reply(200, {
      sol: {
        per_compute_unit: {
          percentiles: {
            '60': 100000,
            '75': 590909,
            '85': 1716561,
          },
        },
      },
    })
    .persist();
}
