import {
  AddressLookupTableAccount,
  BlockhashWithExpiryBlockHeight,
  Commitment,
  Connection,
  GetAccountInfoConfig,
  GetLatestBlockhashConfig,
  GetProgramAccountsConfig,
  GetProgramAccountsResponse,
  PublicKey,
  RpcResponseAndContext,
  Transaction,
} from '@solana/web3.js';
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm';
import { createPublicClient, http, MINT, PROGRAM_ID, TOKEN_2022_ID } from '../../sdk/src';
import EarnAuthority from '../../sdk/src/earn_auth';
import nock from 'nock';
import { LiteSVM, SimulatedTransactionInfo } from 'litesvm';

describe('Yield calculation tests', () => {
  mockSubgraph();
  const svm = fromWorkspace('').withSplPrograms().withBuiltins().withBlockhashCheck(false);
  const evmClient = createPublicClient({ transport: http('http://localhost:8545') });
  const provider = new LiteSVMProvider(svm);
  const connection = provider.connection;

  // missing functions on litesvm connection
  connection.getProgramAccounts = getProgramAccountsFn(connection) as any;

  // Global Account
  const setGlobalAccount = (index: bigint, ts: bigint) => {
    let data = Buffer.from(
      'p+joschscn+z3HtcE1xihhozJWJpdvNsPnG5FAKFUFeJ7wZJIrxP9rPce1wTXGKGGjMlYml282w+cbkUAoVQV4nvBkkivE/2C4a+Zr/OtMHX6Se8xNAUvg8oY6ud+F/aYQhRtk29CuWi1F1V6gAAAGcE+WcAAAAALAEAAAAAAADIQyqyAAAAAKYQEAAAAAAAAAAAAAAAAAAAworvSLaa9zZOKqEFGwy9QYBPHRQ7fiNje3tQRsh7nZ2Ejcy6QIu31s1lF6hkb3IdT4FVx4WdL0sgfT7v5zngWv4=',
      'base64',
    );

    // modify fields
    data.writeBigUInt64LE(index, 104);
    data.writeBigUInt64LE(ts, 112);

    // admin and earn auth
    data = Buffer.concat([
      data.subarray(0, 8),
      provider.wallet.publicKey.toBuffer(),
      provider.wallet.publicKey.toBuffer(),
      data.subarray(72),
    ]);

    svm.setAccount(PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID)[0], {
      executable: false,
      owner: PROGRAM_ID,
      lamports: 2408160,
      data,
    });
  };

  // Earner Account
  const setEarnerAccount = (lastClaimIndex: bigint, lastClaimTs: bigint) => {
    const data = Buffer.from(
      '7H4zYC7hZ8+dP+dS6gAAAACU+GcAAAAA/1RZLpCj0IEtK6ZxLixCiIow0yZuY2CEYQkUMthQ74N5sHTq5RmAUD4wwoHg/7Y8xTN4Aa0/+wBNl5B7wbnLnps=',
      'base64',
    );

    // modify fields
    data.writeBigUInt64LE(lastClaimIndex, 8);
    data.writeBigUInt64LE(lastClaimTs, 16);

    svm.setAccount(new PublicKey('HL9tuoLSJiPfDqUGtT9QpNo2RmNGPFDmGhEj1cVEfoBG'), {
      executable: false,
      owner: PROGRAM_ID,
      lamports: 1510320,
      data,
    });
  };

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

  // Mint Mulitsig
  svm.setAccount(new PublicKey('ms2SCrTYioPuumF6oBvReXoVRizEW5qYkiVuUEak7Th'), {
    executable: false,
    owner: TOKEN_2022_ID,
    lamports: 4851120,
    data: Buffer.from(
      'AQMBs9x7XBNcYoYaMyViaXbzbD5xuRQChVBXie8GSSK8T/aEjcy6QIu31s1lF6hkb3IdT4FVx4WdL0sgfT7v5zngWpqi4sY9y+ewdvC16uOIBwi7WXZH30fakiTG4FNjJA/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
      'base64',
    ),
  });

  // User Token Account
  svm.setAccount(new PublicKey('CspA87dFGL6oEtPuz42KHQS2eAiiQzh239vei4Ki8FoG'), {
    executable: false,
    owner: TOKEN_2022_ID,
    lamports: 2108880,
    data: Buffer.from(
      'C4a+Zr/OtMHX6Se8xNAUvg8oY6ud+F/aYQhRtk29CuVUWS6Qo9CBLSumcS4sQoiKMNMmbmNghGEJFDLYUO+DecVPDwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgcAAAAPAAEAAA==',
      'base64',
    ),
  });

  test('calculations', async () => {
    setGlobalAccount(BigInt(1005454559906), BigInt(1644372839));
    setEarnerAccount(BigInt(1004454559906), BigInt(1444372839));

    const auth = await EarnAuthority.load(connection, evmClient);
    const earner = (await auth.getAllEarners())[0];

    const ix = await auth.buildClaimInstruction(earner);

    // build transaction
    const tx = new Transaction().add(ix!);
    tx.feePayer = provider.wallet.publicKey;
    tx.recentBlockhash = svm.latestBlockhash();
    tx.sign(provider.wallet.payer);

    // simulate and parse logs for rewards amount
    const result = svm.simulateTransaction(tx) as SimulatedTransactionInfo;
    const rewards = auth['_getRewardAmounts'](result.meta().logs())[0];
    console.log('Amounts:', rewards.user.toString(), rewards.fee.toString());
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

function getProgramAccountsFn(connection: Connection) {
  return async (programId: PublicKey, config: GetProgramAccountsConfig): Promise<GetProgramAccountsResponse> => {
    // earners
    if ((config as any)?.filters?.[0].memcmp?.bytes === 'gZH8R1wytJi') {
      return [
        {
          account: (await connection.getAccountInfo(new PublicKey('HL9tuoLSJiPfDqUGtT9QpNo2RmNGPFDmGhEj1cVEfoBG')))!,
          pubkey: new PublicKey('HL9tuoLSJiPfDqUGtT9QpNo2RmNGPFDmGhEj1cVEfoBG'),
        },
      ];
    }
    return [];
  };
}
