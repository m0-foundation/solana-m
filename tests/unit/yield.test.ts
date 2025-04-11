import { GetProgramAccountsConfig, GetProgramAccountsResponse, PublicKey, Transaction } from '@solana/web3.js';
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm';
import { createPublicClient, http, MINT, PROGRAM_ID, TOKEN_2022_ID } from '../../sdk/src';
import EarnAuthority from '../../sdk/src/earn_auth';
import nock from 'nock';

describe('Yield calculation tests', () => {
  mockSubgraph();
  const svm = fromWorkspace('').withSplPrograms().withBuiltins().withBlockhashCheck(false);
  const evmClient = createPublicClient({ transport: http('http://localhost:8545') });
  const provider = new LiteSVMProvider(svm);
  const connection = provider.connection;

  // missing function on litesvm connection
  connection.getProgramAccounts = getProgramAccounts as any;

  // Global Account
  // index: 1006454559906
  // ts:    1744372839
  svm.setAccount(PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID)[0], {
    executable: false,
    owner: PROGRAM_ID,
    lamports: 2408160,
    data: Buffer.from(
      'p+joschscn+z3HtcE1xihhozJWJpdvNsPnG5FAKFUFeJ7wZJIrxP9rPce1wTXGKGGjMlYml282w+cbkUAoVQV4nvBkkivE/2C4a+Zr/OtMHX6Se8xNAUvg8oY6ud+F/aYQhRtk29CuWi1F1V6gAAAGcE+WcAAAAALAEAAAAAAADIQyqyAAAAAKYQEAAAAAAAAAAAAAAAAAAAworvSLaa9zZOKqEFGwy9QYBPHRQ7fiNje3tQRsh7nZ2Ejcy6QIu31s1lF6hkb3IdT4FVx4WdL0sgfT7v5zngWv4=',
      'base64',
    ),
  });

  // Earner Account
  // user:                6gG7w73TvK4WTccs9N9wjYERSasczd9x68NgTDy2zBvQ
  // lastClaimIndex:      1006413234077
  // lastClaimTimestamp:  1744344064
  svm.setAccount(new PublicKey('HL9tuoLSJiPfDqUGtT9QpNo2RmNGPFDmGhEj1cVEfoBG'), {
    executable: false,
    owner: PROGRAM_ID,
    lamports: 1510320,
    data: Buffer.from(
      '7H4zYC7hZ8+dP+dS6gAAAACU+GcAAAAA/1RZLpCj0IEtK6ZxLixCiIow0yZuY2CEYQkUMthQ74N5sHTq5RmAUD4wwoHg/7Y8xTN4Aa0/+wBNl5B7wbnLnps=',
      'base64',
    ),
  });

  // Mint
  svm.setAccount(MINT, {
    executable: false,
    owner: TOKEN_2022_ID,
    lamports: 4851120,
    data: Buffer.from(
      'AQAAAAt+HmYkvrxuIRc9WMtEGFHidulJDPbDH2C3PqhmCtaMyEMqsgAAAAAGAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARIAQACz3HtcE1xihhozJWJpdvNsPnG5FAKFUFeJ7wZJIrxP9guGvma/zrTB1+knvMTQFL4PKGOrnfhf2mEIUbZNvQrlDgBAALPce1wTXGKGGjMlYml282w+cbkUAoVQV4nvBkkivE/2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAEEAs9x7XBNcYoYaMyViaXbzbD5xuRQChVBXie8GSSK8T/YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATAMIAs9x7XBNcYoYaMyViaXbzbD5xuRQChVBXie8GSSK8T/YLhr5mv860wdfpJ7zE0BS+Dyhjq534X9phCFG2Tb0K5QgAAABNIGJ5IE1eMAEAAABNNAAAAGh0dHBzOi8vZXRoZXJzY2FuLmlvL3Rva2VuL2ltYWdlcy9tMHRva2VuX25ld18zMi5wbmcBAAAAAwAAAGV2bSoAAAAweDg2NkEyQkY0RTU3MkNiY0YzN0Q1MDcxQTdhNTg1MDNCZmIzNmJlMWI=',
      'base64',
    ),
  });

  test('calculations', async () => {
    const auth = await EarnAuthority.load(connection, evmClient);
    const earners = await auth.getAllEarners();

    for (const earner of earners) {
      const ix = await auth.buildClaimInstruction(earner);
      const result = await connection.simulateTransaction(new Transaction().add(ix!));
      expect(result.value.logs).toBeDefined();
    }
  });
});

function mockSubgraph() {
  nock('https://api.studio.thegraph.com')
    .post('/query/106645/m-token-transactions/version/latest', (body) => body.operationName === 'getBalanceUpdates')
    .reply(200, {
      data: {
        tokenAccount: {
          balance: '100000000',
          transfers: [
            {
              amount: '-1000000',
              ts: '1000',
            },
            {
              amount: '3000000',
              ts: '750',
            },
            {
              amount: '-1500000',
              ts: '500',
            },
            {
              amount: '-10000',
              ts: '250',
            },
          ],
        },
      },
    })
    .persist();
}

async function getProgramAccounts(
  programId: PublicKey,
  configOrCommitment?: GetProgramAccountsConfig,
): Promise<GetProgramAccountsResponse> {
  return [];
}
