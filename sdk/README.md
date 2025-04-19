# M0 Solana SDK

This SDK allows earn managers to add eaners and fetch their historical and pending yield.

```bash
npm i @m0-foundation/solana-m-sdk
```

https://www.npmjs.com/package/@m0-foundation/solana-m-sdk

### Sample Usage

```typescript
import { EarnManager } from '@m0-foundation/solana-m-sdk';

const manager = await EarnManager.fromManagerAddress(connection, evmClient, graphClient, manager.publicKey);
const ix = await manager.buildAddEarnerInstruction(user);

const earner = await Earner.fromTokenAccount(connection, evmClient, graphClient, tokenAccount);
const claims = await earner.getHistoricalClaims();
```
