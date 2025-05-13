import { Bridge, Claim } from '../generated/api';
import { EventsService } from '../generated/api/resources/events/service/EventsService';
import { database } from './db';

const parseLimitQuery = (reqQuery: { skip?: number; limit?: number }) => {
  return { skip: reqQuery?.skip ?? 0, limit: Math.min(reqQuery?.limit ?? 100, 1000) };
};

export const events = new EventsService({
  bridges: async (req, res, next) => {
    const { limit, skip } = parseLimitQuery(req.query);

    const coll = database.collection('bridge_events');
    const cursor = coll.find({}, { limit, skip });
    const result = await cursor.toArray();

    res.send({
      bridges: result.map((bridge) => {
        const bridgeEvent: Bridge = {
          amount: bridge.amount,
          chain: bridge.chain,
          from: bridge.from,
          to: bridge.to,
          programId: bridge.program_id,
          signature: bridge.signature,
          tokenSupply: bridge.token_supply,
          ts: bridge.transaction.block_time,
        };
        return bridgeEvent;
      }),
    });
  },

  claims: async (req, res, next) => {
    const { limit, skip } = parseLimitQuery(req.query);
    const { programId, tokenAccount } = req.params;

    const cursor = database
      .collection('claim_events')
      .find(
        { token_account: tokenAccount, program_id: programId },
        { limit, skip, sort: { 'transaction.block_height': -1 } },
      );

    const result = await cursor.toArray();

    res.send({
      claims: result.map((claim) => {
        const claimEvent: Claim = {
          amount: claim.amount,
          index: claim.index,
          programId: claim.program_id,
          tokenAccount: claim.token_account,
          recipientTokenAccount: claim.recipient_token_account,
          signature: claim.signature,
          ts: claim.transaction.block_time,
        };
        return claimEvent;
      }),
    });
  },
});
