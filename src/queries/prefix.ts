// Builds an OpenSearch prefix query DSL object.
// Matches documents where the field value starts with the given prefix —
// the primary building block for type-ahead / autocomplete features.
// Best used on keyword fields or the keyword sub-field of a text field;
// prefix queries on analysed text fields can produce unexpected results
// because the stored tokens may differ from the raw input.
//
// Example:
//   buildPrefixQuery("title", "opensear")
//   // => {
//   //      query: {
//   //        prefix: {
//   //          title: "opensear",
//   //        },
//   //      },
//   //    }

export function buildPrefixQuery(field: string, prefix: string): object {
  return {
    query: {
      prefix: {
        [field]: prefix,
      },
    },
  };
}
