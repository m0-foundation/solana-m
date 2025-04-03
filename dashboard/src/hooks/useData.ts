import { UseQueryOptions, UseQueryResult, useQuery } from '@tanstack/react-query';
import { useSettings } from '../context/settings';

type QueryFnWithUrl<T> = (url: string) => Promise<T>;

type QueryKey = `${string}:rpc` | `${string}:subgraph`;

export function useData<T>(
  key: QueryKey | [QueryKey, string],
  queryFn: QueryFnWithUrl<T>,
  options?: Omit<UseQueryOptions<T, Error, T, string[]>, 'queryKey' | 'queryFn'>,
): UseQueryResult<T, Error> {
  const { graphqlUrl, rpcUrl } = useSettings();

  let keys: [QueryKey, string];
  if (typeof key === 'string') {
    keys = [key, 'dummy'];
  } else {
    keys = key;
  }

  const url = keys[0].endsWith('rpc') ? rpcUrl : graphqlUrl;

  return useQuery({
    queryKey: keys,
    queryFn: () => queryFn(url),
    ...options,
  });
}
