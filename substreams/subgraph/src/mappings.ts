import { Protobuf } from 'as-proto/assembly';
import { TokenTransactions as protoTokenTransactions } from './pb/transfers/v1/TokenTransactions';
import { BigInt, Bytes } from '@graphprotocol/graph-ts';
import { TokenHolder, TokenAccount, BalanceUpdate, IndexUpdate, Claim, ClaimStats } from '../generated/schema';
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

        // Aggregate Stats
        let claimStats = ClaimStats.load(Bytes.fromUTF8('claim-stats'));
        if (!claimStats) {
          claimStats = new ClaimStats(Bytes.fromUTF8('claim-stats'));
          claimStats.total_claimed = BigInt.zero();
          claimStats.num_claims = BigInt.zero();
        }

        claimStats.total_claimed = claimStats.total_claimed.plus(claim.amount);
        claimStats.num_claims = claimStats.num_claims.plus(BigInt.fromU32(1));

        claim.save();
        claimStats.save();
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
      const balanceUpdate = new BalanceUpdate(id('tranfser', update.pubkey, txn.signature));
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
  let tokenHolder = TokenHolder.load(b58(update.owner));
  if (!tokenHolder) {
    tokenHolder = new TokenHolder(b58(update.owner));
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
    tokenAccount.owner = b58(update.owner);
    tokenAccount.balance = BigInt.zero();
    tokenAccount.cumulative_claims = BigInt.zero();
  }

  return tokenAccount;
}

function b58(value: string): Bytes {
  return Bytes.fromUint8Array(decode(value));
}

function id(prefix: string, account: string, signature: string): Bytes {
  return Bytes.fromUTF8(prefix).concat(b58(account).concat(b58(signature)));
}

function indexId(n: i64, signature: string): Bytes {
  return Bytes.fromByteArray(Bytes.fromI64(n)).concat(b58(signature));
}
