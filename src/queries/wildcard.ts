// Builds an OpenSearch wildcard query DSL object.
// Supports glob-style patterns: `?` matches any single character,
// `*` matches zero or more characters (e.g. "opensear*", "op?nsearch").
// Leading wildcards (e.g. "*search") are very expensive — they require a
// full index scan. Avoid them in hot paths.
//
// Example:
//   buildWildcardQuery("title", "opensear*")
//   // => {
//   //      query: {
//   //        wildcard: {
//   //          title: {
//   //            value: "opensear*",
//   //          },
//   //        },
//   //      },
//   //    }

export function buildWildcardQuery(field: string, pattern: string): object {
  return {
    query: {
      wildcard: {
        [field]: {
          value: pattern,
        },
      },
    },
  };
}
