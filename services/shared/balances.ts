import { Logger } from '../../sdk/src/logger';

export async function logBalance(rpc: string, address: string, logger: Logger, warnThreshold = 10_000_000) {
  const raw = JSON.stringify({
    method: 'getBalance',
    params: [address],
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
    logger.error('Failed to fetch Solana balance', { status: resp.status, statusText: resp.statusText });
    return;
  }

  const data = await resp.json();
  const balance = data.result?.value || 0;

  const log = balance > warnThreshold ? logger.info : logger.error;
  log('solana balance', { balance, balanceDecimal: balance / 1e9, address });
}

export async function logEvmBalance(rpc: string, address: string, logger: Logger, warnThreshold = 5000000000000000n) {
  const raw = JSON.stringify({
    method: 'eth_getBalance',
    params: [address, 'latest'],
    id: 1,
    jsonrpc: '2.0',
  });

  var requestOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  };

  const resp = await fetch(rpc, requestOptions);
  if (!resp.ok) {
    logger.error('Failed to fetch Ethereum balance', { status: resp.status, statusText: resp.statusText });
    return;
  }

  const data = await resp.json();
  const balance = BigInt(data.result);

  const log = balance > warnThreshold ? logger.info : logger.error;
  log('ethereum balance', { balance, balanceDecimal: Number(balance) / 1e18, address });
}
