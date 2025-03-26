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
    process.argv.push('--skipConfirm', 'true');

    await yieldCLI();
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

  nock('https://quicknode.com')
    .get('/_gas-tracker')
    .query({ slug: 'solana' })
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

  nock('http://localhost:8899')
    .post(
      '/',
      (body) => body.method === 'getProgramAccounts' && body.params?.[1].filters?.[0].memcmp.bytes === 'gZH8R1wytJi', // earners
    )
    .reply(200, {
      jsonrpc: '2.0',
      result: [],
      id: 'b509d315-7773-49e0-87ce-4b10524c7515',
    })
    .persist();

  nock('http://localhost:8899')
    .post('/', (body) => body.method === 'getLatestBlockhash')
    .reply(200, {
      jsonrpc: '2.0',
      result: {
        context: {
          apiVersion: '2.2.0',
          slot: 369962085,
        },
        value: {
          blockhash: '7rCouaLD532r6wyXLsnx9mQGf4A7eMiWcnFd9SWu3EPF',
          lastValidBlockHeight: 357940737,
        },
      },
      id: 'b509d315-7773-49e0-87ce-4b10524c7515',
    })
    .persist();

  nock('http://localhost:8899')
    .post('/', (body) => body.method === 'sendTransaction')
    .reply(200, {
      jsonrpc: '2.0',
      result: '2id3YC2jK9G5Wo2phDx4gJVAew8DcY5NAojnVuao8rkxwPYPe8cSwE5GzhEgJA2y8fVjDEo6iR6ykBvDxrTQrtpb',
      id: 'b509d315-7773-49e0-87ce-4b10524c7515',
    })
    .persist();
}
