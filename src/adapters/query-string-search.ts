import { buildQueryStringQuery } from '../queries/query-string.js';
import { executeSearch } from './execute-search.js';
import type { SearchResult, Tenant } from '../types/domains.js';

export async function queryStringSearch(
  tenant: Tenant,
  query: string,
  fields: string[],
): Promise<SearchResult[]> {
  return executeSearch(tenant, buildQueryStringQuery(query, fields));
}
