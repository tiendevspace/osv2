// Builds an OpenSearch query_string query DSL object.
// Accepts a Lucene query syntax string, allowing power users to express
// boolean operators, field targeting, ranges, and wildcards in a single
// expression (e.g. "title:opensearch AND body:index*").
// Should not be exposed directly to untrusted user input — malformed
// Lucene syntax throws a parsing error from the cluster.
//
// Example:
//   buildQueryStringQuery("title:opensearch AND body:index*", ["title", "body"])
//   // => {
//   //      query: {
//   //        query_string: {
//   //          query: "title:opensearch AND body:index*",
//   //          fields: ["title", "body"],
//   //        },
//   //      },
//   //    }

export function buildQueryStringQuery(
  query: string,
  fields: string[],
): object {
  return {
    query: {
      query_string: {
        query,
        fields,
      },
    },
  };
}
