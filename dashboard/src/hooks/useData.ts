import { UseQueryOptions, UseQueryResult, useQuery } from '@tanstack/react-query';
import { useSettings } from '../context/settings';

type QueryFnWithUrl<T> = (url: string) => Promise<T>;

export function useData<T>(
  resource: 'rpc' | 'subgraph',
  queryFn: QueryFnWithUrl<T>,
  options?: Omit<UseQueryOptions<T, Error, T, string[]>, 'queryKey' | 'queryFn'>,
): UseQueryResult<T, Error> {
  const { graphqlUrl, rpcUrl } = useSettings();
  const url = resource === 'rpc' ? rpcUrl : graphqlUrl;

  // use function name as the default query key
  const queryKey = [queryFn.name, resource];

  return useQuery({
    queryKey,
    queryFn: () => queryFn(url),
    ...options,
  });
}
