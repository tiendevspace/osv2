# Project Documentation

---

## Directory and file structure

```
osv2/
├── src/
│   ├── types/
│   │   ├── opensearch.ts     ← OpenSearch client and response types
│   │   ├── queries.ts        ← Query shape types
│   │   └── domains.ts        ← Domain/business types (Tenant, Document, etc.)
│   ├── config/
│   │   └── tenants.ts        ← Tenant registry: hardcoded tenants + getTenant / getAllTenants
│   ├── queries/              ← Query builder functions
│   ├── adapters/             ← OpenSearch client wrappers
│   │   ├── client.ts         ← Singleton client, env validation, testConnection()
│   │   └── index-manager.ts  ← Index lifecycle: createTenantIndex(), indexExists()
│   ├── services/             ← Business logic
│   └── index.ts              ← Entry point
├── .env.example
├── CLAUDE.md
├── DECISIONS.md
├── DOCUMENTATION.md
├── package.json
└── tsconfig.json
```

### `src/types/` — three-file type split

Types are split across three files because each has a different **direction of dependency**. Keeping them separate prevents domain types from accidentally importing wire types and vice versa.

| File | Why it exists | What lives there |
|---|---|---|
| `opensearch.ts` | SDK/HTTP types must not bleed into domain code | `OpenSearchClient` type alias, `ClusterHealthResponse`, `SearchHit`, `SearchResponse` |
| `queries.ts` | Query shapes need to be expressible without knowing OpenSearch DSL | `MatchQuery`, `BoolQuery`, `RangeFilter`, etc. — internal representations used by query builders |
| `domains.ts` | Business concepts must stay independent of the search layer | `Tenant`, `Document`, `SearchResult`, `Facet`, pagination types |

The dependency rule: `domains.ts` must not import from `opensearch.ts` or `queries.ts`. Adapters may import all three.

### `src/queries/` — query builder functions

Pure functions that translate domain types into OpenSearch DSL. They accept types from `queries.ts` and return raw DSL objects. Because they are pure (no side effects, no network calls), they are trivial to unit-test without a running cluster. One file per query family, e.g. `matchQuery.ts`, `filterByTenant.ts`.

### `src/adapters/` — OpenSearch client wrappers

Thin wrappers around the OpenSearch SDK. Each adapter sends a request and maps the raw response back to a domain type. No business logic lives here — adapters are I/O only. `client.ts` is the only file in the entire project that imports `@opensearch-project/opensearch` directly.

### `src/services/` — business logic

The layer callers actually use. Services orchestrate adapters (to talk to OpenSearch) and query builders (to construct the right DSL). They work entirely with domain types and never touch the SDK directly.

### `src/index.ts` — entry point

Loads environment variables via `dotenv`, calls `testConnection()`, and exits with code `1` if the cluster is unreachable. After a successful connection it calls `createTenantIndex("demo")` to provision the demo tenant's index. As the codebase grows this will re-export the public surface of the library.

---

### Root config files

| File | Why it exists | Key contents |
|---|---|---|
| `package.json` | Node project manifest | `@opensearch-project/opensearch`, `dotenv`, `typescript`, `ts-node`; three scripts: `build`, `dev`, `typecheck` |
| `tsconfig.json` | TypeScript compiler config | `strict: true`, `target: ES2022`, `module/moduleResolution: NodeNext` — see tsconfig options below |
| `.env.example` | Documents required env vars | `OPENSEARCH_URL`, `OPENSEARCH_USERNAME`, `OPENSEARCH_PASSWORD` — copy to `.env`, never commit `.env` |
| `CLAUDE.md` | Conventions for future sessions | Layering rules, one-export-per-file rule, no DSL outside `queries/`, no `@ts-ignore` without justification |
| `DECISIONS.md` | Architecture decision log | Blank template with Decision / Alternatives / Rationale headings — fill in one block per non-obvious choice |

---

### `tsconfig.json` options explained

| Option | What it does |
|---|---|
| `"target": "ES2022"` | Keeps modern syntax (class fields, `??=`, top-level `await`) native rather than down-compiling to older JS |
| `"module": "NodeNext"` | Uses Node's native ESM/CJS resolution; required when using `"type": "module"` or `.mjs`/`.cjs` extensions |
| `"moduleResolution": "NodeNext"` | Must pair with `module: NodeNext` — resolves imports the same way Node 18+ does, honouring `package.json` `exports` maps |
| `"strict": true` | Master switch enabling all `strict*` flags: no implicit `any`, strict null checks, strict function types, etc. |
| `"noUncheckedIndexedAccess"` | `arr[0]` has type `T \| undefined`, not `T` — prevents silent out-of-bounds reads |
| `"exactOptionalPropertyTypes"` | Distinguishes a missing optional property from one explicitly set to `undefined` |
| `"noImplicitOverride"` | Subclass methods that shadow a base method must use the `override` keyword — prevents accidental shadowing |
| `"esModuleInterop"` | Allows `import x from 'x'` for CommonJS modules without `* as` syntax |
| `"declaration"` | Emits `.d.ts` files alongside compiled JS so the output is consumable by other TypeScript projects |
| `"sourceMap"` | Emits `.map` files so stack traces in errors point to `.ts` sources, not compiled JS |
| `"skipLibCheck"` | Skips type-checking of `.d.ts` files in `node_modules` — faster builds, avoids upstream type bugs |

---

## What the OpenSearch client does under the hood when it connects

When you call `new Client({ node, auth, ssl })` from `@opensearch-project/opensearch`, no network traffic happens yet. The constructor does three things immediately:

1. **Parses the node URL** into a `ConnectionPool` entry — an internal structure that holds the host, port, protocol, and current "alive/dead" status of each node. In a multi-node cluster you would pass an array; the pool then round-robins or uses a weighted strategy across them.

2. **Creates a `Transport` layer** — the object responsible for serialising request options (method, path, body, query string) into an HTTP request, picking a node from the pool, and retrying on transient failures. By default the SDK retries up to 3 times on connection errors, with exponential back-off.

3. **Creates a `Serializer`** — handles JSON encode/decode for request bodies and response bodies. The SDK uses `JSON.parse` / `JSON.stringify` internally; you can swap in a faster serialiser (e.g. `@elastic/elasticsearch`-compatible `@nicolo-ribaudo/json-c`) if throughput becomes a bottleneck.

When `testConnection()` calls `client.cluster.health()`, the Transport:

1. Selects a node from the connection pool (the single node we configured).
2. Opens a **persistent HTTP/1.1 connection** (keep-alive). The underlying Node.js `http.Agent` or `https.Agent` maintains a socket pool; subsequent requests reuse existing sockets rather than performing a new TCP handshake each time.
3. Attaches **Basic Auth** as an `Authorization: Basic <base64>` header derived from the `username:password` pair we provided. No OAuth or API-key negotiation happens unless you configure it explicitly.
4. For HTTPS, the TLS handshake occurs here — certificate verification is controlled by `rejectUnauthorized`. With the flag `true` (the default), Node.js validates the server's certificate against the system CA store; setting it to `false` disables validation (acceptable only in development against self-signed certs).
5. Sends `GET /_cluster/health` and awaits the response.
6. On a non-2xx HTTP status or a socket error, the Transport marks the node as "dead", waits, and retries. On a 200, it deserialises the JSON body and resolves the promise.

The cluster health endpoint is the canonical "ping" because it is lightweight (no index scan), always available on any node, and returns immediately useful diagnostic information (status green/yellow/red, node count).

---

## Why isolate the client in an adapter?

### The problem with direct use

If every service, query builder, or route handler imports and calls `new Client(...)` directly:

- **Credentials are re-read (or re-validated) in multiple places** — a missing env var surfaces as an obscure runtime error far from startup.
- **The SDK's API becomes your API.** When `@opensearch-project/opensearch` releases a breaking change (it has, between v1 and v2), every file that imports it must change.
- **Testing requires a live cluster** everywhere. There is no single seam to mock.
- **Connection pooling breaks.** Creating multiple `Client` instances means multiple socket pools competing for the same connections.

### What the adapter buys us

`src/adapters/client.ts` is the **single point of contact** between our code and the SDK:

| Concern | How the adapter handles it |
|---|---|
| Env validation | `requireEnv()` throws at module load — failure is immediate and descriptive |
| Singleton | One `Client` instance → one connection pool → sockets are reused across all callers |
| SDK version changes | Only `client.ts` needs updating; services import `OpenSearchClient` from `types/opensearch.ts` |
| Testing | Swap out the exported `client` with a mock in tests — one substitution point |
| SSL policy | Centralised; `rejectUnauthorized` is controlled by an env flag, not scattered across files |

### The layering rule

```
services/  →  adapters/  →  @opensearch-project/opensearch
               ↑
          only layer that imports the SDK directly
```

`services/` call adapter functions. Adapter functions call the SDK. Nothing else does. This is the same reason a database layer wraps `pg` or `mysql2` — you want one seam, not a mesh.

---

## File inventory

| File | Purpose |
|---|---|
| `src/types/opensearch.ts` | `OpenSearchClient` type alias; `ClusterHealthResponse`, `SearchHit`, `SearchResponse` interfaces |
| `src/types/queries.ts` | Internal query shape types: `KeywordQuery` |
| `src/types/domains.ts` | Business/domain types: `Tenant`, `Document`, `SearchResult`, `RawPage` |
| `src/config/tenants.ts` | Tenant registry: hardcoded `Tenant` array, `getTenant(id)`, `getAllTenants()` |
| `src/adapters/client.ts` | Singleton client construction, env validation, `testConnection()` |
| `src/adapters/index-manager.ts` | Index lifecycle: `createTenantIndex()`, `indexExists()` — all accept `Tenant` |
| `src/adapters/ingest.ts` | Document ingestion: `indexDocument()`, `bulkIndexDocuments()` — all accept `Tenant` |
| `src/adapters/execute-search.ts` | Shared search executor: `executeSearch()` — sends a DSL query to OpenSearch and maps hits to `SearchResult[]` |
| `src/adapters/keyword-search.ts` | Search adapter: `keywordSearch()` |
| `src/adapters/phrase-search.ts` | Search adapter: `phraseSearch()` |
| `src/adapters/prefix-search.ts` | Search adapter: `prefixSearch()` |
| `src/adapters/wildcard-search.ts` | Search adapter: `wildcardSearch()` |
| `src/adapters/fuzzy-search.ts` | Search adapter: `fuzzySearch()` |
| `src/adapters/query-string-search.ts` | Search adapter: `queryStringSearch()` |
| `src/adapters/transformer.ts` | Page transformer: `transformPage()`, `transformPages()` — converts `RawPage[]` to `Document[]`; normalises whitespace before slicing body |
| `src/queries/keyword.ts` | Query builder: `buildKeywordQuery()` |
| `src/queries/phrase.ts` | Query builder: `buildPhraseQuery()` |
| `src/queries/prefix.ts` | Query builder: `buildPrefixQuery()` |
| `src/queries/wildcard.ts` | Query builder: `buildWildcardQuery()` |
| `src/queries/fuzzy.ts` | Query builder: `buildFuzzyQuery()` |
| `src/queries/query-string.ts` | Query builder: `buildQueryStringQuery()` |
| `src/services/crawler.ts` | Web crawler service: `crawlUrl(startUrl)` — crawls a URL and its same-domain links to depth 2, returns `RawPage[]` |
| `src/scripts/cli.ts` | Interactive CLI for ingestion, search, and index management. Includes tenant provisioning: derives a tenant ID from a display name, checks for an existing index, prompts for confirmation before overwriting, creates the index with mappings, and prints the applied configuration. |
| `src/scripts/test-isolation.ts` | Tenant isolation smoke test: provisions two test indices, ingests fixture documents, asserts cross-tenant search isolation, then tears down |
| `src/index.ts` | Entry point |
| `.env.example` | Documents the three required environment variables |
| `package.json` | Dependencies and npm scripts (`build`, `dev`, `cli`, `typecheck`, `test:isolation`) |
| `tsconfig.json` | TypeScript compiler configuration |
| `DECISIONS.md` | Records non-obvious architectural choices |
| `CLAUDE.md` | Conventions reference for future sessions |
| `DOCUMENTATION.md` | This file — explanations, rationale, and reference |

---

## Environment variables

| Variable | Purpose | Example |
|---|---|---|
| `OPENSEARCH_URL` | Full URL to the cluster node | `https://localhost:9200` |
| `OPENSEARCH_USERNAME` | HTTP Basic Auth username | `admin` |
| `OPENSEARCH_PASSWORD` | HTTP Basic Auth password | `changeme` |
| `OPENSEARCH_REJECT_UNAUTHORIZED` | Set to `false` to disable TLS cert verification (dev only) | `false` |

---

## Tenant configuration (`src/config/tenants.ts`)

All tenants are declared in a single registry file rather than being derived from user input or inferred from index names at runtime. This means:

- The URL to crawl is co-located with the tenant ID — no need to ask for it at the CLI prompt.
- Per-tenant BM25 field boosts (`fieldWeights`) can be declared alongside the tenant without touching any adapter code.
- `getTenant(id)` is the single lookup point; callers never construct index names themselves.

Every adapter that previously accepted a `tenantId: string` and computed `tenant_${id}_documents` internally now accepts a `Tenant` object and reads `tenant.indexName` directly. This removes three duplicated `indexName()` helpers (one each in `indexManager.ts`, `search.ts`, `ingest.ts`).

---

## Domain types (`src/types/domains.ts`)

`domains.ts` defines four business types. Page metadata is grouped under a dedicated `PageMetadata` interface and attached to `RawPage`, `Document`, and `SearchResult` as an optional `metadata` sub-object.

### `PageMetadata`

All fields extracted from HTML meta tags and document structure. Every field is optional because not every page publishes every tag.

| Field | Type | Source |
|---|---|---|
| `description?` | `string` | `meta[name=description]` → `meta[property=og:description]` |
| `lang?` | `string` | `html[lang]` |
| `canonical_url?` | `string` | `link[rel=canonical][href]` |
| `author?` | `string` | `meta[name=author]` |
| `published_at?` | `string` | `meta[property=article:published_time]` → `meta[name=date]` |
| `modified_at?` | `string` | `meta[property=article:modified_time]` → `meta[name=last-modified]` |
| `og_image?` | `string` | `meta[property=og:image]` |
| `og_type?` | `string` | `meta[property=og:type]` |
| `keywords?` | `string[]` | `meta[name=keywords]`, split on `,` |
| `headings?` | `string[]` | `h1, h2, h3` text in document order |

### `RawPage`

Raw crawler output. Core fields plus an optional `metadata?: PageMetadata` sub-object. The `metadata` key is absent entirely when no metadata fields are present on a page.

| Field | Type | Source |
|---|---|---|
| `url` | `string` | Request URL |
| `title` | `string` | `<title>` |
| `body` | `string` | Concatenated `<p>` text |
| `crawled_at` | `string` | ISO 8601 timestamp set at crawl time |
| `metadata?` | `PageMetadata` | Optional sub-object of all extracted metadata |

### `Tenant`

Defines one logical tenant. All fields are used by at least one adapter or service layer.

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Short, URL-safe identifier (e.g. `anthropic`) |
| `name` | `string` | Human-readable display name |
| `sourceUrl` | `string` | Root URL passed to the crawler for ingest |
| `indexName` | `string` | OpenSearch index name — derived as `tenant_{id}_documents` |
| `fieldWeights?.title` | `number` | Optional BM25 boost for the `title` field |
| `fieldWeights?.body` | `number` | Optional BM25 boost for the `body` field |

### `Document`

Mirrors `RawPage` but adds `tenant_id` and renames `crawled_at` → `created_at`. The `metadata` sub-object passes through as-is from `RawPage`.

### `SearchResult`

Returned by search adapters. Carries `metadata?: Pick<PageMetadata, 'description' | 'published_at'>` — only the two fields needed for display (snippet and recency indicator).

`created_at` and `crawled_at` are both typed as `string` (ISO 8601) because JSON has no native date type.

---

## Web crawler (`src/services/crawler.ts`)

### What it does

Exports one function: `crawlUrl(startUrl: string): Promise<RawPage[]>`.

It uses Crawlee's `CheerioCrawler` to fetch HTML pages, parse them, and follow links — returning a flat array of `RawPage` objects with no OpenSearch interaction.

### CheerioCrawler vs a plain `fetch()` call

`fetch()` makes one HTTP request and returns. You handle retries, concurrency, rate-limiting, and link-following yourself.

`CheerioCrawler` is a managed crawl loop. It maintains an internal **request queue** seeded with the start URL. The `requestHandler` runs for each page; calling `enqueueLinks()` inside the handler adds discovered links to the queue. Crawlee processes the queue concurrently, retries transient failures automatically, and stops when the queue is empty or a limit is reached. Each handler receives `$` — a pre-parsed Cheerio DOM ready to query, with no manual HTML parsing needed.

### Crawl depth

Depth 0 is the start URL. Depth 1 is every link found on it. Depth 2 is every link found on those pages. `maxCrawlDepth: 2` stops Crawlee from enqueuing links beyond that level. Without a limit, a site with internal links grows the queue indefinitely. Depth 2 is enough to demonstrate the crawler working without producing hundreds of pages.

### Same-domain restriction

`EnqueueStrategy.SameDomain` in the `enqueueLinks()` call restricts followed links to URLs sharing the same registered domain as `startUrl`. Links to external sites are ignored. This prevents the crawl from escaping to the wider web.

### Metadata extraction

After extracting `title` and `body`, the `requestHandler` also extracts all metadata fields defined on `RawPage`. A local helper `attr(selector, attribute)` wraps Cheerio's `.attr()` with a trim and empty-string guard, returning `undefined` when no value is present:

```ts
function attr(selector: string, attribute: string): string | undefined {
  const val = $(selector).attr(attribute)?.trim();
  return val !== '' ? val : undefined;
}
```

For fields with multiple possible sources (e.g. `description` from `meta[name=description]` falling back to `meta[property=og:description]`), the nullish coalescing operator (`??`) takes the first non-empty value.

Only defined values are included in the `metadata` object (conditional spread). If no metadata fields are present, the `metadata` key is omitted from the `RawPage` entirely. This satisfies `exactOptionalPropertyTypes: true`, which requires absent optional properties to be truly absent rather than set to `undefined`.

### MemoryStorage

By default Crawlee writes a `storage/` directory to disk (request queues, datasets). `crawlUrl` is a library function that should have no filesystem side-effects, so `MemoryStorage` from `@crawlee/memory-storage` is passed as the storage provider via a `Configuration` instance. The crawl runs entirely in memory and no files are written.

### Body normalisation

Before the body is sliced to `BODY_MAX_LENGTH`, it is passed through `normaliseBody`, which:

1. Replaces all newline sequences (`\r\n`, `\r`, `\n`) with a single space — Cheerio's `.text()` preserves newlines from the HTML source, leaving `\n` noise in the assembled string.
2. Collapses runs of two or more spaces or tab characters to a single space.
3. Trims leading and trailing whitespace.

Normalisation happens **before** slicing so the 10,000-character limit always applies to clean text, not text padded with newline characters.

### Why RawPage is separate from Document

`Document` carries tenant ownership (`tenant_id`) and a `created_at` timestamp — concepts belonging to the search index. `RawPage` is raw extraction output with no knowledge of multi-tenancy or indexing. Keeping them separate means:

- The crawler service can be called without an OpenSearch connection.
- `crawled_at` records when the page was fetched; `created_at` is set by the ingestion layer during `RawPage → Document` transformation.
- Each type can evolve independently.

---

## Index management (`src/adapters/index-manager.ts`)

### What it does

Two exported functions manage the lifecycle of a tenant's index:

| Function | Behaviour |
|---|---|
| `indexExists(tenant)` | `HEAD /{index}` — returns `true` if the index exists (HTTP 200), `false` otherwise (HTTP 404) |
| `createTenantIndex(tenant)` | Checks existence first; creates the index with explicit mappings and settings if absent; logs and returns early if already present |
| `deleteTenantIndex(tenant)` | Deletes the index; no-ops if absent |

The guard in `createTenantIndex` makes the function **idempotent** — safe to call on every startup without failing or duplicating the index.

### Index naming: `tenant_{id}_documents`

Each tenant gets its own dedicated index rather than sharing one index with a `tenant_id` filter. The reasons:

- **Data isolation** — a bug in a query cannot accidentally surface another tenant's documents. With a shared index that risk is structural; with separate indices it is impossible at the API level.
- **Instant deletion** — removing a tenant's data is a single `DELETE /tenant_acme_documents` call. In a shared index, `deleteByQuery` is slow and leaves deleted-document tombstones until a segment merge.
- **Schema flexibility** — different tenants may eventually need different field mappings or analysis chains. Separate indices make per-tenant customisation trivial.
- **Independent tuning** — shard count, replica count, and index settings can be set per tenant based on their actual data volume.

### Metadata field mappings

Metadata fields are nested under a `metadata` object mapping in OpenSearch. OpenSearch treats a plain object field as an implicit `object` type, so each sub-field is declared under `metadata.properties`:

| Field | OpenSearch type | Rationale |
|---|---|---|
| `metadata.description` | `text` | Full-text search + ranking signal |
| `metadata.lang` | `keyword` | Exact-match filter / facet |
| `metadata.canonical_url` | `keyword` | Deduplication filter |
| `metadata.author` | `keyword` | Faceting |
| `metadata.published_at` | `date` | Date-range filter, recency ranking |
| `metadata.modified_at` | `date` | Freshness signal |
| `metadata.og_image` | `keyword` (`index: false`) | Stored but not searched |
| `metadata.og_type` | `keyword` | Content-type faceting |
| `metadata.keywords` | `text` | Ranking signal (analysed) |
| `metadata.headings` | `text` | Structural ranking signal |

Querying a nested field uses dot notation: `metadata.description`, `metadata.published_at`, etc.

### Mappings: `text` vs `keyword`

OpenSearch field types control how a value is stored and whether it is analysed before indexing:

| Type | Analysed? | What "analysed" means | Use for |
|---|---|---|---|
| `text` | Yes | Value is tokenised, lowercased, and (by default) stemmed before indexing | Full-text search — `"Searching"` matches a query for `"search"` |
| `keyword` | No | Value is stored verbatim as a single token | Exact match, filters, aggregations, sorting |

`title` and `body` are `text` so free-text queries work naturally. `url` and `tenant_id` are `keyword` because you only ever filter on their exact value — partial URL matches would be wrong, and `tenant_id` is always compared with `===` semantics.

### Settings: shards and replicas

An OpenSearch index is divided into **shards**, each of which is an independent Lucene instance. Sharding allows data to be distributed across multiple nodes (horizontal scaling) and queries to run in parallel across shards.

**Replicas** are complete copies of a shard kept on *different* nodes. They serve two purposes: fault tolerance (a replica is promoted if the primary node dies) and read throughput (replicas can serve search requests).

| Setting | Dev value | Why |
|---|---|---|
| `number_of_shards: 1` | 1 | Single-node cluster — no benefit to splitting data across shards that all live on the same machine |
| `number_of_replicas: 0` | 0 | No second node to place a replica on; OpenSearch leaves the slot unassigned, which is why cluster status shows `yellow` (all data is safe, but redundancy is unmet) |

For production: increase replicas to at least 1 and size shards to keep each shard under ~50 GB.

---

## Document ingestion (`src/adapters/ingest.ts`)

### What it does

Two exported functions handle writing documents into an index:

| Function | Behaviour |
|---|---|
| `indexDocument(tenant, doc)` | `PUT /{index}/{id}` — indexes a single document, deriving its ID from the URL |
| `deleteDocument(tenant, url)` | `DELETE /{index}/{id}` — removes a single document by URL |
| `bulkIndexDocuments(tenant, docs)` | `POST /_bulk` — sends all documents in one request; logs succeeded/failed counts |

### Document IDs in OpenSearch

Every document in OpenSearch has a **`_id` field** — a string that uniquely identifies it within an index. It is stored in the segment metadata, not as a field in the document body, but it behaves like a primary key:

- Reads and deletes by ID (`GET /{index}/_doc/{id}`, `DELETE ...`) are O(1) — no query scanning.
- IDs are used to route documents to shards deterministically: `shard = hash(_id) % number_of_primary_shards`. This means a given ID always lands on the same shard.

If you do not supply an ID, OpenSearch generates a random UUID. Supplying your own ID is preferable when the document has a natural unique key (a URL, a database primary key) because it enables **idempotent writes** — the same document ingested twice lands on the same slot.

`ingest.ts` derives the ID by taking a 16-character hex prefix of the SHA-1 hash of the document's URL. SHA-1 is not used here for security — it is used because it produces a compact, deterministic, URL-safe string from an arbitrary-length input.

### What happens when you index a document with the same ID twice

OpenSearch performs a **full replacement** (not a merge). The behaviour depends on whether the document existed:

| Scenario | HTTP status | `result` field in response | What happens |
|---|---|---|---|
| New document | `201 Created` | `"created"` | Document is written for the first time |
| Same ID again | `200 OK` | `"updated"` | Previous document is replaced in full; `_version` increments |

This is called an **upsert-by-ID** or **index operation** in OpenSearch terminology. If you only want to update specific fields without replacing the entire document, use the `_update` API instead (`POST /{index}/_update/{id}` with a `doc` partial body).

Consequence for this project: running `npm run dev` multiple times is safe. The five test documents will be re-indexed (version bumped) but not duplicated.

### The bulk API

**Single-document indexing** sends one HTTP request per document:

```
PUT /tenant_demo_documents/_doc/abc123   ← TCP + TLS + HTTP overhead
{ ...doc }
PUT /tenant_demo_documents/_doc/def456
{ ...doc }
```

**The bulk API** batches all operations into a single request:

```
POST /_bulk
{ "index": { "_index": "tenant_demo_documents", "_id": "abc123" } }
{ ...doc }
{ "index": { "_index": "tenant_demo_documents", "_id": "def456" } }
{ ...doc }
```

This is more efficient for three reasons:

1. **Fewer round-trips.** Each HTTP request has TCP/TLS overhead (handshake on first request, flushing buffers on each). Ten documents → ten round-trips vs one.
2. **Batched Lucene writes.** OpenSearch accumulates bulk operations and writes them to the in-memory buffer (`indexing buffer`) in a single pass before flushing to a Lucene segment. Single writes each trigger their own flush.
3. **Fewer translog fsync calls.** The translog (write-ahead log used for crash recovery) is fsynced after each indexing operation in single mode; bulk mode can coalesce those syncs.

The bulk API returns a per-item result so partial failure is surfaced cleanly: some items can succeed while others fail (e.g. due to a mapping conflict), and the adapter logs each failure reason individually.

A practical rule of thumb: prefer bulk for anything more than one or two documents. For very large datasets, batch in chunks of 5–15 MB of body size or ~1 000 documents — whichever comes first.

---

## Search query builders (`src/queries/`)

Each file exports one pure function that returns an OpenSearch DSL object. All are side-effect-free and require no live cluster to test.

| File | Function | OpenSearch query type | Use case |
|---|---|---|---|
| `keyword.ts` | `buildKeywordQuery(searchTerm)` | `multi_match` | General full-text search across `title` (boosted ×2) and `body` |
| `phrase.ts` | `buildPhraseQuery(field, phrase)` | `match_phrase` | Exact word-order matching — e.g. `"machine learning"` |
| `prefix.ts` | `buildPrefixQuery(field, prefix)` | `prefix` | Type-ahead / autocomplete on a keyword field |
| `wildcard.ts` | `buildWildcardQuery(field, pattern)` | `wildcard` | Glob patterns — `?` = one char, `*` = zero or more |
| `fuzzy.ts` | `buildFuzzyQuery(field, term, fuzziness?)` | `fuzzy` | Typo tolerance via edit distance; defaults to `"AUTO"` |
| `query-string.ts` | `buildQueryStringQuery(query, fields)` | `query_string` | Lucene syntax for power-user queries |

### Choosing the right query type

- **Full-text search across multiple fields** → `buildKeywordQuery`
- **Exact phrase** (word order matters) → `buildPhraseQuery`
- **Autocomplete / starts-with** → `buildPrefixQuery` on a `keyword` field
- **Glob pattern** (partial match with wildcards) → `buildWildcardQuery` — avoid leading `*`; it requires a full index scan
- **Typo tolerance** → `buildFuzzyQuery` with `fuzziness: "AUTO"`
- **Structured Lucene expression** from trusted input → `buildQueryStringQuery`

---

## Keyword search (`src/queries/keyword.ts`, `src/adapters/keyword-search.ts`)

### `buildKeywordQuery`

Returns an OpenSearch DSL object ready to pass as the `body` of a `client.search()` call:

```ts
{
  query: {
    multi_match: {
      query: searchTerm,
      fields: ["title^2", "body"],
    },
  },
}
```

### `keywordSearch`

Calls `client.search()` against `tenant_{tenantId}_documents`, extracts the `hits.hits` array, and maps each hit to a `SearchResult`:

```ts
{ id: hit._id, title: hit._source.title, url: hit._source.url, score: hit._score }
```

---

## CLI (`src/scripts/cli.ts`)

### Purpose

An interactive terminal interface for ingestion and index management. Run it with:

```
npm run cli
```

The CLI clears the screen, renders a coloured banner and a section-grouped menu, then prompts for each required value in turn — no flags needed.

### Menu options

| Key | Section | Action | Prompts |
|---|---|---|---|
| `1` | Ingest | Ingest pages | tenant, URL |
| `2` | Search | Keyword search | tenant, term |
| `3` | Search | Phrase search | tenant, field, phrase |
| `4` | Search | Prefix search | tenant, field, prefix |
| `5` | Search | Wildcard search | tenant, field, pattern |
| `6` | Search | Fuzzy search | tenant, field, term, fuzziness (optional, default `AUTO`) |
| `7` | Search | Query string search | tenant, query expression, fields (optional, default `title,body`) |
| `8` | Index | Provision | display name (ID derived automatically) |
| `9` | Index | Create index | tenant |
| `10` | Index | List indices | — |
| `q` | — | Exit | — |

### Design notes

- Uses Node's built-in `node:readline` (callback style) with a manual `ask()` Promise wrapper — no external dependency.
- **`askRequired`** re-prompts until a non-empty value is entered, preventing silent failures from blank input.
- Optional prompts (fuzziness, query-string fields) fall back to sensible defaults when left blank.
- `banner()` calls `console.clear()` and is called on startup and after every "Press Enter to continue…" pause, keeping the display clean.
- Each action is wrapped in try/catch in the main loop; errors are displayed inline without crashing the process.
- The `MenuItem` interface with a `section` field drives section headers in `printMenu()`, keeping the menu structure declarative.
- `listTenantIndices` in `index-manager.ts` queries `tenant_*_documents` via `cat.indices` and returns sorted index names.

---

## Ingest pipeline (`src/scripts/ingest.ts`)

### Purpose

Wires the crawler, transformer, and bulk-index adapter into a single terminal command:

```
npm run ingest -- --tenant=demo --url=https://example.com
```

### How `process.argv` works

Node populates `process.argv` before your script runs. It is always an array of strings:

```
process.argv[0]  →  '/usr/local/bin/node'   (the Node binary)
process.argv[1]  →  '/opt/osv2/src/scripts/ingest.ts'  (the script path)
process.argv[2]  →  '--tenant=demo'
process.argv[3]  →  '--url=https://example.com'
```

The script skips the first two entries with `.slice(2)` and parses each remaining argument with a regex that matches the `--key=value` shape. This is the simplest approach that avoids a CLI-parsing dependency. If the number of flags grows, a library like `minimist` or `yargs` would be appropriate.

When you run via `npm run ingest -- --tenant=demo --url=...`, npm passes everything after `--` verbatim to the script as extra arguments, which is how they end up in `process.argv[2]` and beyond.

### Pipeline stages and their error handling

| Stage | Function | Error handling |
|---|---|---|
| Validate args | — | `process.exit(1)` immediately if `--tenant` or `--url` is absent — no point starting a crawl without them |
| Crawl | `crawlUrl(url)` | `try/catch` — a network failure or DNS error throws here; we log it, print the summary (with 0 pages), and exit 1 |
| Transform | `transformPages(rawPages, tenant)` | No try/catch — this is a pure function over in-memory data; it cannot fail unless there is a bug |
| Bulk index | `bulkIndexDocuments(tenant, docs)` | `try/catch` — a cluster connection error throws here; per-document failures are already handled inside the adapter and logged individually |

### Why a summary instead of per-document logs

At scale — hundreds or thousands of crawled pages — per-document `console.log` calls would be unreadable in a terminal, would swamp log aggregators (Datadog, CloudWatch), and would make it impossible to see whether the run succeeded at a glance.

A single summary line gives operators the signal they need:

- Did it complete?
- How many pages were crawled vs indexed (the gap is pages dropped by the transformer)?
- Were there errors, and how many?

Per-item failure reasons are already logged inside `bulkIndexDocuments` at the point of failure, so the summary does not need to repeat them.

---

## Tenant isolation test (`src/scripts/test-isolation.ts`)

### Purpose

Verifies that separate tenant indices do not leak documents into each other's search results. Run with:

```
npm run test:isolation
```

### What it does

1. **Provisions** two ephemeral test indices (`test_isolation_tenant_a`, `test_isolation_tenant_b`) via `createTenantIndex`.
2. **Ingests** three fixture documents per tenant via `bulkIndexDocuments`. Each tenant's documents contain a unique term (`xanthium` for A, `zymurgy` for B) that cannot appear in the other tenant's index.
3. **Forces a refresh** on both indices so newly indexed documents are immediately searchable (OpenSearch's default 1-second refresh interval is not guaranteed in tests).
4. **Asserts**:
   - Searching `xanthium` against Tenant A's index returns ≥ 1 result, all with Tenant A URLs.
   - Searching `zymurgy` against Tenant B's index returns ≥ 1 result, all with Tenant B URLs.
   - Searching `xanthium` against Tenant B's index returns 0 results.
   - Searching `zymurgy` against Tenant A's index returns 0 results.
5. **Reports** `[PASS]` or `[FAIL]` for each assertion, with a final summary line.
6. **Tears down** both test indices regardless of outcome.
7. **Exits with code 1** if any assertion fails, so CI can treat it as a failure.

### Why `indices.refresh` is needed

After `bulkIndexDocuments` returns, the documents are in OpenSearch's in-memory indexing buffer. They only become visible to searches after a **segment refresh**, which happens automatically every second by default. In a scripted test that immediately searches after indexing, the second has not elapsed — so the search would return 0 results and the test would incorrectly fail. Calling `client.indices.refresh` synchronously flushes the buffer and makes documents queryable before the search runs.

---

## Concepts

### BM25 — how OpenSearch scores results

BM25 (Best Match 25) is the default relevance algorithm. In plain terms it asks two questions about each document:

1. **How often does the search term appear in this document?** More occurrences → higher score. But the gain diminishes — going from 1 occurrence to 2 helps more than going from 10 to 11. This is called *term frequency saturation*.
2. **How rare is this term across all documents in the index?** If the word "the" appears in every document it tells you nothing; a word that appears in only 3 out of 1 000 documents is highly discriminative. Rare terms are rewarded more than common ones. This is called *inverse document frequency* (IDF).

BM25 also penalises long documents slightly. A document where the term appears 5 times out of 1 000 words is less relevant than one where it appears 5 times out of 50 words — the shorter document is denser with signal.

The result is a floating-point `_score`. Higher scores surface first in the results. There is no fixed maximum; scores are relative to the other documents in the result set.

### `multi_match` vs a standard `match` query

A standard `match` query targets a **single field**:

```json
{ "match": { "body": "inverted index" } }
```

Only the `body` field is searched. A document whose title contains the term but whose body does not will score zero.

`multi_match` runs the same match across **multiple fields simultaneously** and takes the best-scoring field as the document's score (the default `best_fields` type):

```json
{ "multi_match": { "query": "inverted index", "fields": ["title^2", "body"] } }
```

This means a document is found if the term appears in *either* field, and the relevance score reflects whichever field matched most strongly. Without `multi_match` you would need a `bool` query with multiple `should` clauses to achieve the same effect.

### Field boosting (`^2`)

The `^2` suffix multiplies the relevance score for matches in that field by 2 before BM25 combines it with other fields.

Why boost the title? A document whose title is "Inverted Index Explained" is almost certainly *about* inverted indexes. A document whose body mentions "inverted index" in passing is less likely to be the most relevant result. Boosting the title field encodes that editorial judgement directly into the scoring function — no post-processing or re-ranking needed.

A boost of `^2` is a pragmatic starting point. Values below 1 *reduce* a field's influence. In production you tune boosts empirically against click-through or relevance judgement data.

---
