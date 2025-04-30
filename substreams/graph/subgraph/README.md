# M token subgraph

A subgraph is used to track token transfers, balances, claims and index updates. This subgraph will be used in the SDK for token and yield related data.

## Development

A substream is required to pipe data into the subgraph. This substream maps data from a Solana block and transforms it to TokenTransactions defined in /proto/transfers.proto. This entity is what is piped into the subgraph which gets transformed in /subgraph/mappings.ts. You need to build the substream (outputs an spkg file) as this module is required for the substream when deploying.

### substream

```bash
$ cd substream
$ substreams build
```

### subgraph

```bash
$ npm install -g @graphprotocol/graph-cli
$ graph auth ••••••••••••••••••••••••••••••••
```

```
& cd subgraph
$ npm run generate
$ npm run build
$ graph deploy m-token-transactions
```

## Debugging

Logs are available at `https://thegraph.com/studio/subgraph/m-token-transactions/logs`
