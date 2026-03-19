// Builds an OpenSearch match_phrase query DSL object.
// Requires the search terms to appear in the exact order specified — useful
// for searching quoted strings or known phrases (e.g. "machine learning").
//
// Example:
//   buildPhraseQuery("body", "machine learning")
//   // => {
//   //      query: {
//   //        match_phrase: {
//   //          body: "machine learning",
//   //        },
//   //      },
//   //    }

export function buildPhraseQuery(field: string, phrase: string): object {
  return {
    query: {
      match_phrase: {
        [field]: phrase,
      },
    },
  };
}
