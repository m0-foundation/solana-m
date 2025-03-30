import { UseQueryOptions, UseQueryResult, useQuery } from '@tanstack/react-query';
import { useSettings } from '../context/settings';

type QueryFnWithUrl<T> = (url: string) => Promise<T>;

export function useData<T>(
  queryFn: QueryFnWithUrl<T>,
  options?: Omit<UseQueryOptions<T, Error, T, string[]>, 'queryKey' | 'queryFn'>,
): UseQueryResult<T, Error> {
  const { graphqlUrl, rpcUrl } = useSettings();

  // determine which URL to use based on the function name
  const url = queryFn.name.toLowerCase().includes('rpc') ? rpcUrl : graphqlUrl;

  // use function name as the default query key
  const queryKey = [queryFn.name];

  return useQuery({
    queryKey,
    queryFn: () => queryFn(url),
    ...options,
  });
}
