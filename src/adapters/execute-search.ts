import { client } from './client.js';
import type { SearchHit, SearchResponse } from '../types/opensearch.js';
import type { SearchResult, Tenant } from '../types/domains.js';

export async function executeSearch(
  tenant: Tenant,
  query: object,
): Promise<SearchResult[]> {
  const response = await client.search({
    index: tenant.indexName,
    body: query,
  });

  const body = response.body as SearchResponse;

  return body.hits.hits.map((hit: SearchHit) => ({
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
