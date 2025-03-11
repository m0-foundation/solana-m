import { Protobuf } from "as-proto/assembly";
import { TokenTransactions as protoTokenTransactions } from "./pb/transfers/v1/TokenTransactions";
import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { TokenHolder, TokenAccount, BalanceUpdate, Timestamp, IndexUpdate, IndexUpdates, Claim } from "../generated/schema";
import bs58 from 'bs58'
import { TokenBalanceUpdate } from "./pb/transfers/v1/TokenBalanceUpdate";

export function handleTriggers(bytes: Uint8Array): void {
  const input = Protobuf.decode<protoTokenTransactions>(bytes, protoTokenTransactions.decode);

  input.transactions.forEach((txn) => {
    // Timestamp
    const ts = new Timestamp(b58(txn.signature))
    ts.ts = BigInt.fromI64(input.blockTime);
    ts.block = BigInt.fromI64(input.blockHeight);
    ts.signature = b58(txn.signature);
    ts.save()

    // Token Transfers
    txn.balanceUpdates.forEach((update) => {
      const { tokenHolder, tokenAccount } = getOrCreateTokenAccount(update);

      // TokenHolder
      const delta = BigInt.fromI64(update.postBalance - update.preBalance);
      tokenHolder.balance = tokenHolder.balance.plus(delta);

      // BalanceUpdate
      const balanceUpdate = new BalanceUpdate(id("balance-update", txn.signature));
      balanceUpdate.amount = delta;
      balanceUpdate.ts = ts.id;

      // TokenAccount
      tokenAccount.balance = tokenAccount.balance.plus(delta);

      tokenHolder.save()
      balanceUpdate.save();
      tokenAccount.save()
    });

    // Events
    txn.instructions.forEach((ix) => {
      if (ix.indexUpdate) {
        // Index Updates
        let updates = IndexUpdates.load(Bytes.fromUTF8("index-update"));
        if (updates == null) updates = new IndexUpdates(Bytes.fromUTF8("index-update"));

        updates.last_index = BigInt.fromI64(ix.indexUpdate.index);
        updates.last_ts = ts.id;

        // Index Update
        const update = new IndexUpdate(id("index-update", txn.signature));
        update.index = BigInt.fromI64(ix.indexUpdate.index);
        update.ts = ts.id;
        update.updates = updates.id;

        updates.save()
        update.save()
      }
      if (ix.claim) {
        // Claim
        const claim = new Claim(id("claim", txn.signature));
        claim.amount = BigInt.fromI64(ix.claim.amount);
        claim.ts = ts.id;
        claim.token_account = b58(ix.claim.tokenAccount);
        claim.recipient_token_account = b58(ix.claim.recipientTokenAccount);

        claim.save()
      }
    });
  });
}

function getOrCreateTokenAccount(update: TokenBalanceUpdate) {
  let tokenHolder = TokenHolder.load(b58(update.owner));
  if (tokenHolder == null) {
    tokenHolder = new TokenHolder(b58(update.owner))
    tokenHolder.mint = b58(update.mint);
    tokenHolder.user = b58(update.owner);
    tokenHolder.balance = BigInt.zero();
  };

  let tokenAccount = TokenAccount.load(b58(update.pubkey));
  if (tokenAccount == null) {
    tokenAccount = new TokenAccount(b58(update.pubkey))
    tokenAccount.pubkey = b58(update.pubkey);
    tokenAccount.owner = b58(update.owner);
    tokenAccount.balance = BigInt.zero();
    tokenAccount.cumulative_claims = BigInt.zero();
  };

  return { tokenHolder, tokenAccount };
}

function b58(value: string): Bytes {
  return Bytes.fromUint8Array(bs58.decode(value));
}

function id(prefix: string, signature: string): Bytes {
  if (!prefix) return b58(signature);
  return Bytes.fromUTF8(prefix + "-").concat(b58(signature));
}
