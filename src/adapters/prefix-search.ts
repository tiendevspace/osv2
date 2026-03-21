import { buildPrefixQuery } from '../queries/prefix.js';
import { executeSearch } from './execute-search.js';
import type { SearchResult, Tenant } from '../types/domains.js';

export async function prefixSearch(
  tenant: Tenant,
  field: string,
  prefix: string,
): Promise<SearchResult[]> {
  return executeSearch(tenant, buildPrefixQuery(field, prefix));
}
