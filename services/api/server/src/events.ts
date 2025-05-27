import { Bridge, IndexUpdate } from '../generated/api';
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

  indexUpdates: async (req, res, next) => {
    const { limit, skip } = parseLimitQuery(req.query);

    const coll = database.collection('index_updates');
    const cursor = coll.find({}, { limit, skip });
    const result = await cursor.toArray();

    res.send({
      updates: result.map((update) => {
        const updateEvent: IndexUpdate = {
          index: update.index,
          programId: update.program_id,
          signature: update.signature,
          tokenSupply: update.token_supply,
          ts: update.transaction.block_time,
        };
        return updateEvent;
      }),
    });
  },
});
