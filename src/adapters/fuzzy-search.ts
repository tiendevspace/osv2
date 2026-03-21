import { buildFuzzyQuery } from '../queries/fuzzy.js';
import { executeSearch } from './execute-search.js';
import type { SearchResult, Tenant } from '../types/domains.js';

export async function fuzzySearch(
  tenant: Tenant,
  field: string,
  term: string,
  fuzziness?: string,
): Promise<SearchResult[]> {
  return executeSearch(tenant, buildFuzzyQuery(field, term, fuzziness));
}
