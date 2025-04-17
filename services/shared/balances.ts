import { Logger } from '../../sdk/src/logger';

type BlockchainType = 'solana' | 'ethereum';

const blockchainConfigs = {
  solana: {
    method: 'getBalance',
    getParams: (address: string) => [address],
    parseBalance: (result: any) => BigInt(result?.value || 0),
    decimalDivisor: 1e9,
    defaultWarnThreshold: BigInt(10000000),
  },
  ethereum: {
    method: 'eth_getBalance',
    getParams: (address: string) => [address, 'latest'],
    parseBalance: (result: any) => BigInt(result),
    decimalDivisor: 1e18,
    defaultWarnThreshold: BigInt(5000000000000000),
  },
};

export async function logBlockchainBalance(blockchain: BlockchainType, rpc: string, address: string, logger: Logger) {
  const config = blockchainConfigs[blockchain];

  const raw = JSON.stringify({
    method: config.method,
    params: config.getParams(address),
    id: 1,
    jsonrpc: '2.0',
  });

  const requestOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  };

  const resp = await fetch(rpc, requestOptions);
  if (!resp.ok) {
    logger.error(`Failed to fetch ${blockchain} balance`, {
      status: resp.status,
      statusText: resp.statusText,
    });
    return;
  }

  const data = await resp.json();
  const balance = config.parseBalance(data.result);

  const log = balance > config.defaultWarnThreshold ? logger.info : logger.error;
  log(`${blockchain} wallet balance`, {
    balance: balance.toString(),
    balanceDecimal: Number(balance) / config.decimalDivisor,
    address,
  });
}
