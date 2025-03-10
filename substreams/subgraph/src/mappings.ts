import { Protobuf } from "as-proto/assembly";
import { TokenTransactions as protoTokenTransactions } from "./pb/transfers/v1/TokenTransactions";
import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { TokenHolder, TokenAccount } from "../generated/schema";
import bs58 from 'bs58'
import { TokenBalanceUpdate } from "./pb/transfers/v1/TokenBalanceUpdate";

export function handleTriggers(bytes: Uint8Array): void {
  const input = Protobuf.decode<protoTokenTransactions>(bytes, protoTokenTransactions.decode);

  input.transactions.forEach((txn) => {
    txn.balanceUpdates.forEach((update) => {
      const { holder, account } = getOrCreateTokenAccount(update);

      holder.save()
      account.save()
    });
  });
}

function getOrCreateTokenAccount(update: TokenBalanceUpdate) {
  let holder = TokenHolder.load(b58(update.owner));
  if (holder == null) {
    holder = new TokenHolder(b58(update.owner))
    holder.mint = b58(update.mint);
    holder.user = b58(update.owner);
    holder.balance = BigInt.zero();
  };

  let account = TokenAccount.load(b58(update.pubkey));
  if (account == null) {
    account = new TokenAccount(b58(update.pubkey))
    account.pubkey = b58(update.pubkey);
    account.owner = b58(update.owner);
    account.balance = BigInt.zero();
    account.cumulative_claims = BigInt.zero();
  };

  return { holder, account };
}

function b58(value: string): Bytes {
  return Bytes.fromUint8Array(bs58.decode(value));
}