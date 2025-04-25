import { Graph, EarnAuthority } from '../../sdk/src';

// validates the subgraph is up to date
// throws if on-chain data does not match subgraph data
export async function validateSubgraph(authority: EarnAuthority, graph: Graph) {
  const subgraphIndex = await graph.getLatestIndex();
  const index = authority.latestIndex;

  if (subgraphIndex.index.lt(index)) {
    throw new Error(`Subgraph index is not up to date: ${subgraphIndex.index.toString()} vs ${index.toString()}`);
  }
}
