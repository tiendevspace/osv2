// Builds an OpenSearch multi_match query DSL object for full-text keyword search.
// Title matches are boosted (^2) to rank documents where the term appears in the
// title above those where it only appears in the body.
//
// Example:
//   buildKeywordQuery("inverted index")
//   // => {
//   //      query: {
//   //        multi_match: {
//   //          query: "inverted index",
//   //          fields: ["title^2", "body"],
//   //        },
//   //      },
//   //    }

export function buildKeywordQuery(searchTerm: string): object {
  return {
    query: {
      multi_match: {
        query: searchTerm,
        fields: ["title^2", "body"],
      },
    },
  };
}
