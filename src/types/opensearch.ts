import type { Client } from "@opensearch-project/opensearch";

// The OpenSearch client instance type, re-exported so the rest of the codebase
// can reference it without importing directly from the SDK package.
export type OpenSearchClient = Client;

// Shape of the response returned by GET /_cluster/health.
// Only the fields we actually use are declared; OpenSearch returns more.
export interface ClusterHealthResponse {
  cluster_name: string;
  status: "green" | "yellow" | "red";
  timed_out: boolean;
  number_of_nodes: number;
  number_of_data_nodes: number;
  active_primary_shards: number;
  active_shards: number;
  relocating_shards: number;
  initializing_shards: number;
  unassigned_shards: number;
}

// Wire-level shape of a single hit returned by the Search API.
export interface SearchHit {
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

// Wire-level shape of the Search API response body.
export interface SearchResponse {
  hits: {
    hits: SearchHit[];
  };
}
