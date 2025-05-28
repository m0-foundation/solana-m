import { Document } from 'mongodb';

export const parseLimitFilter = (reqQuery: { skip?: number; limit?: number }): Document[] => {
  const docs: Document[] = [];

  if (reqQuery.skip) docs.push({ $skip: reqQuery.skip });
  if (reqQuery.limit) docs.push({ $limit: reqQuery.limit });

  return docs;
};

export const parseTimeFilter = (reqQuery: { from_time?: number; to_time?: number }): Document[] => {
  const docs: Document[] = [];

  if (reqQuery.from_time)
    docs.push({
      $match: {
        'transaction.block_time': {
          $gte: new Date(reqQuery.from_time * 1000),
        },
      },
    });

  if (reqQuery.to_time)
    docs.push({
      $match: {
        'transaction.block_time': {
          $lt: new Date(reqQuery.to_time * 1000),
        },
      },
    });

  return docs;
};
