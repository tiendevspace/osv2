// Builds an OpenSearch fuzzy query DSL object.
// Matches terms within a given edit distance (insertions, deletions,
// substitutions, transpositions) of the search term — useful for tolerating
// typos and spelling variations.
// fuzziness accepts "AUTO" (OpenSearch picks edit distance based on term
// length), or a numeric string "0", "1", or "2" for explicit control.
// "AUTO" is the recommended default for user-facing search.
//
// Example:
//   buildFuzzyQuery("title", "opensarch")
//   // => {
//   //      query: {
//   //        fuzzy: {
//   //          title: {
//   //            value: "opensarch",
//   //            fuzziness: "AUTO",
//   //          },
//   //        },
//   //      },
//   //    }

export function buildFuzzyQuery(
  field: string,
  term: string,
  fuzziness: string = "AUTO",
): object {
  return {
    query: {
      fuzzy: {
        [field]: {
          value: term,
          fuzziness,
        },
      },
    },
  };
}
