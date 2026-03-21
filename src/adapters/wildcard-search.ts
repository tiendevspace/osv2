import { buildWildcardQuery } from '../queries/wildcard.js';
import { executeSearch } from './execute-search.js';
import type { SearchResult, Tenant } from '../types/domains.js';

export async function wildcardSearch(
  tenant: Tenant,
  field: string,
  pattern: string,
): Promise<SearchResult[]> {
  return executeSearch(tenant, buildWildcardQuery(field, pattern));
}
