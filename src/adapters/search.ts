import { client } from "./client.js";
import { buildKeywordQuery } from "../queries/keyword.js";
import { buildPhraseQuery } from "../queries/phrase.js";
import { buildPrefixQuery } from "../queries/prefix.js";
import { buildWildcardQuery } from "../queries/wildcard.js";
import { buildFuzzyQuery } from "../queries/fuzzy.js";
import { buildQueryStringQuery } from "../queries/queryString.js";
import type { SearchResult, Tenant } from "../types/domains.js";

interface SearchHit {
  _id: string;
  _score: number;
  _source: {
    title: string;
    url: string;
    metadata?: {
      description?: string;
      published_at?: string;
    };
  };
}

interface SearchResponse {
  hits: {
    hits: SearchHit[];
  };
}

async function executeSearch(
  tenant: Tenant,
  query: object,
): Promise<SearchResult[]> {
  const response = await client.search({
    index: tenant.indexName,
    body: query,
  });

  const body = response.body as SearchResponse;

  return body.hits.hits.map((hit) => ({
    id: hit._id,
    title: hit._source.title,
    url: hit._source.url,
    score: hit._score,
    ...(hit._source.metadata !== undefined && {
      metadata: {
        ...(hit._source.metadata.description  !== undefined && { description:  hit._source.metadata.description }),
        ...(hit._source.metadata.published_at !== undefined && { published_at: hit._source.metadata.published_at }),
      },
    }),
  }));
}

export async function keywordSearch(
  tenant: Tenant,
  searchTerm: string,
): Promise<SearchResult[]> {
  return executeSearch(tenant, buildKeywordQuery(searchTerm));
}

export async function phraseSearch(
  tenant: Tenant,
  field: string,
  phrase: string,
): Promise<SearchResult[]> {
  return executeSearch(tenant, buildPhraseQuery(field, phrase));
}

export async function prefixSearch(
  tenant: Tenant,
  field: string,
  prefix: string,
): Promise<SearchResult[]> {
  return executeSearch(tenant, buildPrefixQuery(field, prefix));
}

export async function wildcardSearch(
  tenant: Tenant,
  field: string,
  pattern: string,
): Promise<SearchResult[]> {
  return executeSearch(tenant, buildWildcardQuery(field, pattern));
}

export async function fuzzySearch(
  tenant: Tenant,
  field: string,
  term: string,
  fuzziness?: string,
): Promise<SearchResult[]> {
  return executeSearch(tenant, buildFuzzyQuery(field, term, fuzziness));
}

export async function queryStringSearch(
  tenant: Tenant,
  query: string,
  fields: string[],
): Promise<SearchResult[]> {
  return executeSearch(tenant, buildQueryStringQuery(query, fields));
}
