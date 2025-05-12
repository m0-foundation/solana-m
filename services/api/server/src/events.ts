import { Bridge } from '../generated/api';
import { EventsService } from '../generated/api/resources/events/service/EventsService';
import { database } from './db';

export const events = new EventsService({
  bridges: async (req, res, next) => {
    const { limit, skip } = req.query;

    const coll = database.collection('bridge_events');
    const cursor = coll.find({}, { skip: skip ?? 0, limit: Math.min(limit ?? 100, 1000) });
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
});
