import { buildPhraseQuery } from '../queries/phrase.js';
import { executeSearch } from './execute-search.js';
import type { SearchResult, Tenant } from '../types/domains.js';

export async function phraseSearch(
  tenant: Tenant,
  field: string,
  phrase: string,
): Promise<SearchResult[]> {
  return executeSearch(tenant, buildPhraseQuery(field, phrase));
}
