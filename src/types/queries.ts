// Types that describe the *shape* of queries before they are serialised.
// These are our internal representations — not raw OpenSearch DSL objects.
// Query builder functions in src/queries/ will accept and return these types.

export interface KeywordQuery {
  searchTerm: string;
  fields: string[];
}

export interface PhraseQuery {
  field: string;
  phrase: string;
}

export interface PrefixQuery {
  field: string;
  prefix: string;
}

export interface WildcardQuery {
  field: string;
  pattern: string;
}

export interface FuzzyQuery {
  field: string;
  term: string;
  fuzziness?: string;
}

export interface QueryStringQuery {
  query: string;
  fields: string[];
}
