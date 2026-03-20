// Business / domain types: Tenant, Document, SearchResult, Facet, etc.
// These are the shapes that services and callers work with — independent of
// how OpenSearch represents the same data on the wire.

export interface Tenant {
  id: string;
  name: string;
}

export interface PageMetadata {
  description?: string;
  lang?: string;
  canonical_url?: string;
  author?: string;
  published_at?: string;
  modified_at?: string;
  og_image?: string;
  og_type?: string;
  keywords?: string[];
  headings?: string[];
}

export interface Document {
  title: string;
  body: string;
  url: string;
  created_at: string; // ISO 8601 date string
  tenant_id: string;
  metadata?: PageMetadata;
}

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  score: number;
  metadata?: Pick<PageMetadata, 'description' | 'published_at'>;
}

export interface RawPage {
  url: string;
  title: string;
  body: string;
  crawled_at: string; // ISO 8601
  metadata?: PageMetadata;
}
