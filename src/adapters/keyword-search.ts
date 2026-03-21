import { buildKeywordQuery } from '../queries/keyword.js';
import { executeSearch } from './execute-search.js';
import type { SearchResult, Tenant } from '../types/domains.js';

export async function keywordSearch(
  tenant: Tenant,
  searchTerm: string,
): Promise<SearchResult[]> {
  return executeSearch(tenant, buildKeywordQuery(searchTerm));
}
