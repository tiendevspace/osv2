# Architecture Decisions

---

## Decision

`SearchResult` lives in `src/types/domains.ts`, not `src/types/queries.ts`.

## Alternatives

Placing it in `queries.ts` alongside `KeywordQuery` would keep all search-related types together, which has some surface logic.

## Rationale

`SearchResult` is a business type — it is what a caller receives and displays; it has no relationship to query construction. `CLAUDE.md` explicitly lists it as a domain type. The type-flow rule (`domains.ts` must not import from `queries.ts`) would be violated if a future domain type needed to reference `SearchResult` and it lived in `queries.ts`. Query-shape types describe the *input* to a search; `SearchResult` is the *output* — two different concerns.

---

## Decision

`fuzziness` in `FuzzyQuery` and `buildFuzzyQuery` is typed as `string` rather than `number | "AUTO"`.

## Alternatives

A union type `0 | 1 | 2 | "AUTO" | "AUTO:low,high"` would be more precise. A separate numeric type would allow arithmetic validation at compile time.

## Rationale

The OpenSearch API accepts `fuzziness` as either a JSON string (`"AUTO"`, `"AUTO:3,6"`) or a JSON number (`0`, `1`, `2`). Typing it as `string` keeps the interface simple, matches the most common usage (`"AUTO"`), and avoids an overly long union that would still need a runtime bounds check. A comment in the source explains the accepted values.

---

## Decision

`buildPrefixQuery` and `buildWildcardQuery` accept a `field` parameter rather than hardcoding document fields.

## Alternatives

Hardcode `title` and/or `url` the way `buildKeywordQuery` hardcodes `["title^2", "body"]`.

## Rationale

Prefix and wildcard queries are almost always field-specific — an autocomplete on titles needs the `title` field; a URL pattern match needs the `url` field. Hardcoding a single field would make the builder only useful for one call site. Accepting `field` keeps the function general without adding complexity; the caller encodes the intent.

---

## Decision

`MemoryStorage` from `@crawlee/memory-storage` is used as the Crawlee storage provider rather than the default `FileSystemStorage`.

## Alternatives

Accept the default — Crawlee creates a `storage/` directory at the project root.

## Rationale

`crawlUrl` is a library function with no assumptions about the working directory. Writing to the filesystem is a surprising side-effect for a function that returns a `RawPage[]`. `MemoryStorage` keeps the function free of filesystem side-effects, makes it safe to call in tests without cleanup, and requires no `.gitignore` additions.

---

## Decision

`CheerioCrawler` is used for web crawling rather than `PlaywrightCrawler` or `PuppeteerCrawler`.

## Alternatives

`PlaywrightCrawler` would handle JavaScript-rendered pages.

## Rationale

`CheerioCrawler` is HTTP-only — it downloads HTML and parses it with Cheerio, with no browser process. It is faster, uses far less memory, and has no binary dependencies (Playwright requires ~300 MB of browser binaries). The current requirement is extracting `<title>` and `<p>` tags from server-rendered HTML; a headless browser is not needed.

---

## Decision

Each tenant is given a dedicated OpenSearch index (e.g. `tenant_acme_corp_documents`) rather than sharing one index with a `tenant_id` filter field.

## Alternatives

Store all tenants' documents in a single shared index (e.g. `all_documents`) and filter every search query with a `term` clause on `tenant_id`. This is operationally simpler — one index to manage, no per-tenant provisioning step.

## Rationale

- **Isolation by structure, not by discipline.** With a shared index, a missing `tenant_id` filter in any query silently leaks cross-tenant results. With separate indices, that leakage is structurally impossible — a query against `tenant_acme_corp_documents` cannot return documents from `tenant_opensearch_documents` at the API level.
- **Instant, clean deletion.** Removing a tenant's data is a single `DELETE /tenant_{id}_documents` call. In a shared index, deletion requires a `deleteByQuery` scan, which is slow, resource-intensive, and leaves tombstoned documents in segment files until the next merge.
- **Schema flexibility.** Different tenants may need different field mappings (e.g. additional language analysers, per-tenant custom fields). With separate indices, per-tenant schema customisation is straightforward. In a shared index all tenants must share one mapping.
- **Independent tuning.** Shard count, replica count, and index settings can be set per tenant based on their actual data volume.

---

## Decision

`KeywordQuery` is defined in `src/types/queries.ts` but not used by `buildKeywordQuery` in its current form.

## Alternatives

Pass `KeywordQuery` directly into `buildKeywordQuery` rather than a bare `string`.

## Rationale

`buildKeywordQuery` takes a plain `searchTerm: string` because the function itself encodes the field list — the caller does not choose fields. `KeywordQuery` documents the internal shape for when a richer query builder that accepts field overrides is needed. This keeps the public API simple now without discarding the type infrastructure.

