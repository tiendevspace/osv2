import { client } from "./client.js";
import { buildKeywordQuery } from "../queries/keyword.js";
import { buildPhraseQuery } from "../queries/phrase.js";
import { buildPrefixQuery } from "../queries/prefix.js";
import { buildWildcardQuery } from "../queries/wildcard.js";
import { buildFuzzyQuery } from "../queries/fuzzy.js";
import { buildQueryStringQuery } from "../queries/queryString.js";
import type { SearchResult } from "../types/domains.js";

function indexName(tenantId: string): string {
  return `tenant_${tenantId}_documents`;
}

interface SearchHit {
  _id: string;
  _score: number;
  _source: {
    title: string;
    url: string;
  };
}

interface SearchResponse {
  hits: {
    hits: SearchHit[];
  };
}

async function executeSearch(
  tenantId: string,
  query: object,
): Promise<SearchResult[]> {
  const response = await client.search({
    index: indexName(tenantId),
    body: query,
  });

  const body = response.body as SearchResponse;

  return body.hits.hits.map((hit) => ({
    id: hit._id,
    title: hit._source.title,
    url: hit._source.url,
    score: hit._score,
  }));
}

export async function keywordSearch(
  tenantId: string,
  searchTerm: string,
): Promise<SearchResult[]> {
  return executeSearch(tenantId, buildKeywordQuery(searchTerm));
}

export async function phraseSearch(
  tenantId: string,
  field: string,
  phrase: string,
): Promise<SearchResult[]> {
  return executeSearch(tenantId, buildPhraseQuery(field, phrase));
}

export async function prefixSearch(
  tenantId: string,
  field: string,
  prefix: string,
): Promise<SearchResult[]> {
  return executeSearch(tenantId, buildPrefixQuery(field, prefix));
}

export async function wildcardSearch(
  tenantId: string,
  field: string,
  pattern: string,
): Promise<SearchResult[]> {
  return executeSearch(tenantId, buildWildcardQuery(field, pattern));
}

export async function fuzzySearch(
  tenantId: string,
  field: string,
  term: string,
  fuzziness?: string,
): Promise<SearchResult[]> {
  return executeSearch(tenantId, buildFuzzyQuery(field, term, fuzziness));
}

export async function queryStringSearch(
  tenantId: string,
  query: string,
  fields: string[],
): Promise<SearchResult[]> {
  return executeSearch(tenantId, buildQueryStringQuery(query, fields));
}
