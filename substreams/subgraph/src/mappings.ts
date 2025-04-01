import { Protobuf } from 'as-proto/assembly';
import { TokenTransactions as protoTokenTransactions } from './pb/transfers/v1/TokenTransactions';
import { BigInt, Bytes } from '@graphprotocol/graph-ts';
import {
  TokenHolder,
  TokenAccount,
  BalanceUpdate,
  IndexUpdate,
  Claim,
  ClaimStats,
  BridgeEvent,
  BridgeStats,
} from '../generated/schema';
import { TokenBalanceUpdate } from './pb/transfers/v1/TokenBalanceUpdate';
import { decode } from 'as-base58';

export function handleTriggers(bytes: Uint8Array): void {
  const input = Protobuf.decode<protoTokenTransactions>(bytes, protoTokenTransactions.decode);

  for (let i = 0; i < input.transactions.length; i++) {
    const txn = input.transactions[i];
    const formatedIxs: string[] = [];

    // Events
    for (let j = 0; j < txn.instructions.length; j++) {
      const ix = txn.instructions[j];
      formatedIxs.push(`${ix.programId}:${ix.instruction}`);

      if (ix.indexUpdate) {
        // Index Update
        const update = new IndexUpdate(indexId(ix.indexUpdate!.index, txn.signature));
        update.index = BigInt.fromI64(ix.indexUpdate!.index);
        update.ts = BigInt.fromI64(input.blockTime);
        update.signature = b58(txn.signature);

        update.save();
      }
      if (ix.claim) {
        // Claim
        const claim = new Claim(id('claim', ix.claim!.tokenAccount, txn.signature));
        claim.amount = BigInt.fromI64(ix.claim!.amount);
        claim.token_account = b58(ix.claim!.tokenAccount);
        claim.recipient_token_account = b58(ix.claim!.recipientTokenAccount);
        claim.ts = BigInt.fromI64(input.blockTime);
        claim.signature = b58(txn.signature);
        claim.manager_fee = BigInt.fromI64(ix.claim!.managerFee);
        claim.index = BigInt.fromI64(ix.claim!.index);

        // Aggregate Stats
        let claimStats = ClaimStats.load(id('claim-stats', ix.programId, ''));
        if (!claimStats) {
          claimStats = new ClaimStats(id('claim-stats', ix.programId, ''));
          claimStats.total_claimed = BigInt.zero();
          claimStats.num_claims = 0;
          claimStats.program_id = b58(ix.programId);
        }

        claimStats.total_claimed = claimStats.total_claimed.plus(claim.amount);
        claimStats.num_claims = claimStats.num_claims + 1;

        claim.save();
        claimStats.save();
      }
      if (ix.bridgeEvent) {
        // Bridge Event
        const bridge = new BridgeEvent(id('bridge', txn.signature, ''));
        bridge.ts = BigInt.fromI64(input.blockTime);
        bridge.signature = b58(txn.signature);
        bridge.amount = BigInt.fromI64(ix.bridgeEvent!.amount);
        bridge.to = Bytes.fromUint8Array(ix.bridgeEvent!.to);
        bridge.from = Bytes.fromUint8Array(ix.bridgeEvent!.from);
        bridge.chain = ix.bridgeEvent!.chain;

        // Bridge Stats
        let bridgeStats = BridgeStats.load(Bytes.fromUTF8('bridge-stats'));
        if (!bridgeStats) {
          bridgeStats = new BridgeStats(Bytes.fromUTF8('bridge-stats'));
          bridgeStats.bridge_volume = BigInt.zero();
          bridgeStats.num_bridges = 0;
          bridgeStats.net_bridged_amount = BigInt.zero();
        }

        bridgeStats.bridge_volume = bridgeStats.bridge_volume.plus(bridge.amount.abs());
        bridgeStats.num_bridges = bridgeStats.num_bridges + 1;
        bridgeStats.net_bridged_amount = bridgeStats.net_bridged_amount.plus(bridge.amount);

        bridge.save();
        bridgeStats.save();
      }
    }

    // Token Transfers
    for (let j = 0; j < txn.balanceUpdates.length; j++) {
      const update = txn.balanceUpdates[j];

      const tokenHolder = getOrCreateTokenHolder(update);
      const tokenAccount = getOrCreateTokenAccount(update);

      // TokenHolder
      const delta = BigInt.fromI64(update.postBalance - update.preBalance);
      tokenHolder.balance = tokenHolder.balance.plus(delta);

      // BalanceUpdate
      const balanceUpdate = new BalanceUpdate(id('transfer', update.pubkey, txn.signature));
      balanceUpdate.amount = delta;
      balanceUpdate.ts = BigInt.fromI64(input.blockTime);
      balanceUpdate.signature = b58(txn.signature);
      balanceUpdate.token_account = tokenAccount.id;
      balanceUpdate.instructions = formatedIxs;

      // TokenAccount
      tokenAccount.balance = tokenAccount.balance.plus(delta);

      tokenHolder.save();
      tokenAccount.save();
      balanceUpdate.save();
    }
  }
}

function getOrCreateTokenHolder(update: TokenBalanceUpdate): TokenHolder {
  let tokenHolder = TokenHolder.load(holderID(update.mint, update.owner));
  if (!tokenHolder) {
    tokenHolder = new TokenHolder(holderID(update.mint, update.owner));
    tokenHolder.mint = b58(update.mint);
    tokenHolder.user = b58(update.owner);
    tokenHolder.balance = BigInt.zero();
  }

  return tokenHolder;
}

function getOrCreateTokenAccount(update: TokenBalanceUpdate): TokenAccount {
  let tokenAccount = TokenAccount.load(b58(update.pubkey));
  if (!tokenAccount) {
    tokenAccount = new TokenAccount(b58(update.pubkey));
    tokenAccount.pubkey = b58(update.pubkey);
    tokenAccount.owner = holderID(update.mint, update.owner);
    tokenAccount.balance = BigInt.zero();
    tokenAccount.cumulative_claims = BigInt.zero();
    tokenAccount.mint = b58(update.mint);
  }

  return tokenAccount;
}

function holderID(mint: string, owner: string): Bytes {
  return b58(mint).concat(b58(owner));
}

function b58(value: string): Bytes {
  return Bytes.fromUint8Array(decode(value));
}

function id(prefix: string, address: string, signature: string): Bytes {
  return Bytes.fromUTF8(prefix)
    .concat(b58(address))
    .concat(b58(signature));
}

function indexId(n: i64, signature: string): Bytes {
  return Bytes.fromByteArray(Bytes.fromI64(n)).concat(b58(signature));
}
