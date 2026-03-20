# Architecture Reference

## Dependency Rules

Imports flow downward only. Each layer may import from layers below it, never above.
Violations create circular dependencies, break the client override mechanism, or couple
infrastructure to business logic. Enforce these in code review and (eventually) via
eslint-plugin-import boundaries.

```
Layer 0 — Leaf (no project imports)
  core/types/          Type definitions, interfaces, Zod schemas (incl. auth.ts, export.ts)
  core/defaults/       Fallback implementations (depends on types/ only)
  core/config.ts       Environment variables (depends on types/ only)
  core/config-schema.ts, tenant-naming.ts, url-helpers.ts

Layer 1 — Services (depends on Layer 0)
  core/services/infra/        OS client, logger
  core/services/ai/           Embedding, generation, reranking, chunking
  core/services/search/       Index lifecycle, search pipeline init, corpus analysis
  core/services/crawl/        Scheduler, distributed locking
  core/services/analytics/    Event collection, sessionisation, aggregation, retention
  core/services/export/       Data serialisation (JSON, CSV, XML) — shared by dashboard routes

Layer 2 — Ingestion (depends on Layers 0–1)
  core/ingest/crawlers/       Fetching (depends on types/, config)
  core/ingest/extractors/     Parsing (depends on types/ only — pure transformation)
  core/ingest/pipeline/       Orchestration (depends on crawlers/, extractors/, services/ai/embedding-service)
  core/ingest/observability/  Diagnostics (depends on types/, config — does not affect pipeline behaviour)

Layer 3 — Middleware (depends on Layers 0–1)
  core/middleware/auth.ts         Resolves API key → AuthIdentity (role + tenant scope)
  core/middleware/require-role.ts Route-level role guard (depends on types/auth.ts only)

Layer 4 — Routes (depends on Layers 0–3)
  routes/admin/              Admin-only operations (requireRole: admin)
  routes/dashboard/          Dashboard API — analytics + search config (role-scoped: client sees own, admin sees all)
  routes/search/             Public search API + event collection
  routes/static.ts           Serves dashboard frontend assets

Layer 5 — Entry point
  index.ts                 Wires startup: config → logger → OS client → pipelines → routes → listen

Layer 6 — Dashboard frontend (independent build — consumes Layer 4 via HTTP, no server imports)
  dashboard/               React SPA (Vite) — built separately, served by routes/static.ts
                           Auth: API key → server resolves role → scoped UI

Plugin boundary — clients/ (loaded dynamically, never statically imported by core/)
  clients/*/config.ts       Depends on core/types/, core/config-schema.ts
                            Declares overrides manifest: maps override name → relative path to implementation
  clients/*/mappings/       Depends on core/types/mapping.ts
  clients/*/overrides/      Depends on core/types/overrides.ts (implements interface)
                            May also depend on core/defaults/ (Extend strategy — wraps the default)
                            Must NOT depend on core/services/ or core/ingest/ — overrides are leaf-like
```

### Cross-service rules within Layer 1

Services within Layer 1 may import from each other, but only in the following directions.
Arrows show allowed imports. Any import not listed here is a violation.

```
infra/os-client.ts    ← imported by ai/, search/, crawl/, analytics/ (shared infrastructure)
infra/logger.ts       ← imported by everything (cross-cutting concern)

ai/embedding-service  ← imported by ingest/pipeline/ (embed during indexing)
                      ← imported by defaults/query-builder (embed query text for kNN)
ai/generation-service ← imported by routes/search/rag.ts only (RAG is a route-level concern)
ai/reranker-service   ← imported by routes/search/search.ts, routes/search/rag.ts (post-retrieval step)
ai/chunk-service      ← imported by ingest/pipeline/, ai/generation-service

search/index-manager          ← imported by ingest/pipeline/, routes/admin/operations.ts, routes/dashboard/search-config.ts
search/common-words-analyzer  ← imported by routes/admin/operations.ts (on-demand corpus analysis, not part of ingest)
search/ does NOT import from ai/ — search and AI are independent domains

crawl/crawl-scheduler ← imported by index.ts (startup), routes/admin/operations.ts (manual trigger)
crawl/ does NOT import from ai/ or search/ — crawl orchestration is scheduling only

analytics/event-writer        ← imported by routes/search/ (query + RAG events, server-side)
                              ← imported by routes/search/events.ts (click, suggestion, filter, dwell events from client)
                              ← imported by ingest/pipeline/ (ingestion events after each crawl/push/feed run)
analytics/session-tracker     ← imported by analytics/event-writer (enriches events with session_id)
analytics/aggregation-service ← imported by routes/dashboard/analytics.ts (dashboard queries + on-demand re-computation)
analytics/retention-manager   ← imported by index.ts (startup — ensures ISM policies exist)
analytics/event-schema        ← imported by analytics/event-writer, analytics/retention-manager (index creation)
analytics/ does NOT import from ai/, search/, or crawl/ — it is an independent observability domain

export/export-service  ← imported by routes/dashboard/analytics.ts, routes/dashboard/search-config.ts
                       ← accepts typed result set + ExportFormat → returns Buffer + content-type
export/ imports from infra/logger only — it is a pure serialisation layer with no data access

client-resolver.ts    ← imported by routes/, middleware/auth.ts, crawl/crawl-scheduler
                      ← uses dynamic import() to load from clients/ — NO static imports
```

### Key constraints

- **client-resolver.ts** must use `await import()` or filesystem scanning for client
  discovery. Static `import ... from '../../clients/...'` inverts the architecture.
- **routes/** depend on services only. Never import from `defaults/` or `clients/` directly —
  the resolved config from `client-resolver` already contains the correct implementation.
  Route handlers never know whether they're using a default or an override.
- **defaults/** is a leaf layer like `types/`. It depends on `types/` only. Both `services/`
  and `clients/*/overrides/` depend on it — that's intentional and safe.
- **ai/ and search/ are independent.** If RAG needs retrieval, that composition happens in
  `routes/search/rag.ts`, not inside `ai/generation-service`. This prevents a cycle between
  the two service groups.
- **analytics/ is an independent observability domain.** It writes to its own indices and
  never calls ai/, search/, or crawl/. Data flows *into* analytics via event-writer — it
  never reaches back to query other services.
- **export/ is a pure serialisation layer.** It has no data access — it receives already-fetched
  result sets and serialises them. It does not import from analytics/, search/, or any other
  service group.
- **dashboard/ (frontend) has zero server imports.** It consumes the API via HTTP only.
  Shared types (if needed) are copied or published as a package — never imported across the
  build boundary.
- **Role enforcement is two-layer.** `auth.ts` resolves identity on every request.
  `require-role.ts` guards specific routes. Dashboard routes use both: auth resolves who you
  are, require-role checks you have permission, then the handler scopes data to your tenant(s).
- **Override interfaces are the contract.** Every overridable behaviour has a corresponding
  interface in `types/overrides.ts`. Both `defaults/` and `clients/*/overrides/` implement
  these interfaces. `client-resolver` validates loaded overrides against the interface at
  startup — a bad override fails immediately, not on the first search request.
- **Overrides are declared, not auto-discovered.** Each client's `config.ts` explicitly lists
  which overrides it provides via the `overrides` manifest. `client-resolver` reads this
  manifest — it does not scan the filesystem for override files. Adding a new overridable
  behaviour means adding a new optional key to `ClientConfig.overrides` and a corresponding
  interface to `types/overrides.ts`.
- **Overrides may import from defaults/ (Extend pattern).** An override that wraps or
  modifies the default implementation creates a `clients/ → core/defaults/` dependency. This
  is safe because both are leaf-like layers. An override must NOT import from `services/` or
  `ingest/` — that would couple tenant code to platform internals.

---

## Directory Tree

src/
├── core/                                # Shared engine — do not customise per client
│   ├── config.ts                        # Loads and validates environment variables (OS host, ports, API keys, feature flags)
│   ├── config-schema.ts                 # defineClientConfig(), flattenClientConfigInput(); Zod schemas for client config validation
│   ├── tenant-naming.ts                 # tenantIdToIndexName(), tenantIdToAlias() — maps tenant IDs to OpenSearch index/alias names
│   ├── url-helpers.ts                   # URL normalisation, base-URL resolution, trailing-slash handling
│   │
│   ├── types/                           # Shared type definitions — nothing here imports from services/
│   │   ├── opensearch.ts                # OSResponse<T>, OSHit<T>, BaseDocumentSource, PageMetadata
│   │   ├── client-config.ts             # ClientConfig, DataSourceConfig, CrawlConfigInput, GenerationConfig, RetrievalConfig
│   │   │                                #   ClientConfig.overrides?: optional manifest mapping override names to relative paths
│   │   │                                #     e.g. { queryBuilder: './overrides/query-builder', parsePage: './overrides/parse-page' }
│   │   │                                #   Omit overrides key or set {} → all defaults used. Declared in client config.ts.
│   │   ├── overrides.ts                 # Interfaces for every overridable behaviour — the contract between defaults/ and clients/*/overrides/
│   │   │                                #   QueryBuilder:      buildQuery(request, config) → OpenSearchQuery
│   │   │                                #                      buildSuggestQuery?(prefix, config) → OpenSearchQuery
│   │   │                                #   SearchAdapter:     adaptResults(response) → CleanSearchResult[]
│   │   │                                #   PageParser:        parsePage(html, url) → BaseDocumentSource
│   │   │                                #   ExcludePatterns:   getExcludePatterns(config) → RegExp[]
│   │   │                                #   AnalyticsConfig:   getAnalyticsConfig(config) → AnalyticsSettings
│   │   │                                #   Both core/defaults/ and clients/*/overrides/ implement these interfaces.
│   │   │                                #   client-resolver validates loaded overrides against these at startup.
│   │   ├── llm.ts                       # LLMProvider interface, ChatMessage, ChatOptions
│   │   ├── document-schema.ts           # DocumentSourceSchema — Zod runtime validation for documents before indexing
│   │   ├── mapping.ts                   # IndexMapping, FieldMapping, KnnMethod, IndexSettings
│   │   ├── search.ts                    # CleanSearchResult, SearchRequest, SearchResponse
│   │   ├── analytics-events.ts          # All analytics event types — each extends BaseAnalyticsEvent { tenant_id, timestamp, session_id }
│   │   │                                #   QueryEvent:       raw/normalised query, search type, filters, sort, page, synonym expansion,
│   │   │                                #                     spelling correction, result count, latency breakdown, impression set (doc IDs + positions + scores)
│   │   │                                #   ClickEvent:       search_id (ties to QueryEvent), doc ID, URL, position, time-to-click,
│   │   │                                #                     click type (organic / promoted / suggestion / RAG citation), above/below fold
│   │   │                                #   SuggestionEvent:  suggestions shown (list + positions), suggestion selected (position, chars typed), ignored flag
│   │   │                                #   FilterEvent:      facet name, value, action (added / removed), applied before/after initial results
│   │   │                                #   ZeroResultsEvent: query text, active filters, did-you-mean offered, user retried flag
│   │   │                                #   SessionEvent:     session_id, refinement chain (query A → B → C), outcome, total searches/clicks
│   │   │                                #   RAGEvent:         search_id, chunks used, citation clicked, re-searched after RAG, generation latency
│   │   │                                #   DwellEvent:       search_id, doc ID, dwell time, pogo-stick flag, refined-after flag
│   │   │                                #   IngestionEvent:   tenant_id, data_source, docs indexed/updated/deleted, duration, error count,
│   │   │                                #                     content-change rate, embedding latency, third-party API calls/latency/errors
│   │   ├── analytics-aggregations.ts    # Pre-computed metric types for dashboards:
│   │   │                                #   QueryVolume, CTR, MeanReciprocalRank, ZeroResultsRate,
│   │   │                                #   TopQueries, SlowQueries, FilterUsage, SuggestionAcceptRate
│   │   ├── auth.ts                      # AuthRole ('client' | 'admin'), AuthIdentity { role, tenantId?, keyId }
│   │   │                                #   RequestContext — attached to Fastify request after auth middleware resolves identity
│   │   │                                #   Client role: scoped to single tenant. Admin role: access to all tenants.
│   │   ├── export.ts                    # ExportFormat ('json' | 'csv' | 'xml'), ExportRequest, ExportMetadata
│   │   └── crawl.ts                     # CrawlJob, CrawlStatus
│   │
│   ├── services/                        # Platform-wide services, grouped by domain (what changes together lives together)
│   │   ├── infra/                        # Platform plumbing — changes when infrastructure changes
│   │   │   ├── os-client.ts              # OpenSearch client singleton; indexDocument(), bulkIndex(), refreshIndex(), deleteByQuery()
│   │   │   └── logger.ts                 # Pino structured-logging factory; injects request ID into child loggers for tracing
│   │   │
│   │   ├── ai/                           # Inference layer — changes when models or providers change
│   │   │   ├── ollama-client.ts          # Low-level Ollama HTTP calls: /api/embed, /api/chat, /api/generate (streaming)
│   │   │   ├── llm-provider.ts           # LLMProvider interface + concrete implementations (Ollama, Groq, Together AI)
│   │   │   ├── embedding-service.ts      # Accepts text → returns vector; delegates to Ollama (local) or HuggingFace (remote)
│   │   │   ├── generation-service.ts     # RAG answer generation: builds prompt from context chunks, delegates to LLMProvider
│   │   │   ├── reranker-service.ts       # Cross-encoder re-ranking via HuggingFace API; falls back to original score on failure
│   │   │   └── chunk-service.ts          # Splits long documents into overlapping chunks sized for RAG context windows
│   │   │
│   │   ├── search/                       # Search engine layer — changes when query strategy changes
│   │   │   ├── index-manager.ts          # Index lifecycle: ensureIndex(), reindex(), zero-downtime alias swap via atomic _aliases
│   │   │   ├── search-pipeline-init.ts   # Creates the RRF hybrid-search pipeline on startup; idempotent (skips if exists)
│   │   │   └── common-words-analyzer.ts  # Analyses indexed corpus for high-frequency terms; outputs stopword/boost candidates
│   │   │
│   │   ├── crawl/                        # Crawl orchestration — changes when scheduling/locking logic changes
│   │   │   ├── crawl-scheduler.ts        # Cron-based scheduler: iterates all tenants, acquires lock, dispatches crawl jobs
│   │   │   └── crawl-lock.ts             # Distributed locking via OpenSearch doc (acquireLock, releaseLock, TTL-based expiry)
│   │   │
│   │   ├── analytics/                    # Search analytics — event collection, sessionisation, aggregation, retention
│   │   │   │                             #   Index pattern: .analytics-{event_type}-{yyyy.MM} (e.g. .analytics-queries-2026.03)
│   │   │   │                             #   All events carry tenant_id; index routing on tenant_id for shard-local aggregations
│   │   │   │                             #   Separate index per event type (queries, clicks, suggestions, filters, rag, ingestion)
│   │   │   ├── event-writer.ts           # Buffered bulk writer — batches events, flushes on interval or buffer-size threshold
│   │   │   │                             #   Back-pressure: drops oldest events if buffer full (logs warning via infra/logger)
│   │   │   ├── event-schema.ts           # OpenSearch index mappings per event type — created/updated on startup
│   │   │   ├── session-tracker.ts        # Groups events into sessions: session_id + 30-min inactivity timeout (configurable)
│   │   │   │                             #   Session identity: session cookie + IP hash (no auth required)
│   │   │   ├── aggregation-service.ts    # Pre-computes dashboard metrics: CTR, zero-results rate, top/slow queries, filter usage
│   │   │   │                             #   Runs on schedule (daily) or on-demand via admin API; writes to .analytics-aggregations-{yyyy.MM}
│   │   │   └── retention-manager.ts      # ISM policy management: creates/updates lifecycle policies per event index on startup
│   │   │                                 #   Default: 90 days raw events, 1 year aggregated; configurable per tenant
│   │   │
│   │   ├── export/                       # Data export — serialises result sets to downloadable formats
│   │   │   ├── export-service.ts         # Takes typed result set + ExportFormat → returns Buffer + content-type + filename
│   │   │   │                             #   Shared by analytics dashboard (export query/click data) and search dashboard (export index config)
│   │   │   ├── csv-serialiser.ts         # Result set → CSV with headers; handles nested objects via dot-notation flattening
│   │   │   ├── json-serialiser.ts        # Result set → formatted JSON (pretty-printed, UTF-8)
│   │   │   └── xml-serialiser.ts         # Result set → XML with configurable root/row element names
│   │   │
│   │   └── client-resolver.ts            # Discovers client directories, loads configs, resolves overrides, caches the result
│   │                                     #
│   │                                     #   Override resolution sequence (runs once per tenant at startup or first request):
│   │                                     #
│   │                                     #   1. Scan clients/ for directories containing config.ts
│   │                                     #   2. Dynamic import() each client's config.ts → raw ClientConfig
│   │                                     #   3. Validate config against Zod schema (config-schema.ts) — fail fast on bad config
│   │                                     #   4. Read config.overrides manifest (if present):
│   │                                     #        e.g. { queryBuilder: './overrides/query-builder', parsePage: './overrides/parse-page' }
│   │                                     #   5. For each declared override:
│   │                                     #        a. Dynamic import() the override module
│   │                                     #        b. Validate export against the matching interface from types/overrides.ts
│   │                                     #           (assert expected functions exist and are callable — fail at startup, not at request time)
│   │                                     #        c. Store the validated implementation
│   │                                     #   6. For each overridable behaviour NOT declared in the manifest:
│   │                                     #        → use the corresponding default from core/defaults/
│   │                                     #   7. Cache the fully resolved config (config + resolved implementations)
│   │                                     #
│   │                                     #   At request time: routes call client-resolver with tenant_id → returns cached resolved config
│   │                                     #   The route handler never knows whether it's using a default or an override.
│   │
│   ├── middleware/
│   │   ├── auth.ts                      # Resolves API key → AuthIdentity { role, tenantId?, keyId }
│   │   │                                #   Per-tenant key → client role (scoped to that tenant only)
│   │   │                                #   Global/admin key → admin role (access to all tenants)
│   │   │                                #   Attaches RequestContext to Fastify request for downstream route handlers
│   │   └── require-role.ts              # Route-level guard: requireRole('admin') or requireRole('client')
│   │                                    #   Checks RequestContext.role; returns 403 if insufficient
│   │                                    #   Client role + mismatched tenant_id in URL → 403
│   │
│   ├── defaults/                        # Fallback implementations — used when a client provides no override
│   │   │                                #   OVERRIDABLE files implement interfaces from types/overrides.ts.
│   │   │                                #   Clients can Replace (full reimplementation) or Extend (import default, wrap/modify).
│   │   │                                #   INTERNAL files are building blocks consumed by other defaults — not client-facing.
│   │   │
│   │   │                                # — Overridable (clients may provide alternatives via overrides/) —
│   │   ├── query-builder.ts             # Implements QueryBuilder. Builds keyword, semantic, or hybrid (RRF) queries from SearchRequest
│   │   ├── search-adapter.ts            # Implements SearchAdapter. Transforms raw OSResponse<T> → CleanSearchResult[]
│   │   ├── parse-page.ts                # Implements PageParser. Cheerio-based HTML → BaseDocumentSource: title, body, meta, dates
│   │   ├── exclude-patterns.ts          # Implements ExcludePatterns. RegExp[] of URLs to skip during crawl (pagination, feeds, print views)
│   │   ├── analytics-config.ts          # Implements AnalyticsConfig. Per-tenant defaults:
│   │   │                                #   buffer size, flush interval, session timeout (30 min), retention (90 days raw / 1 year agg),
│   │   │                                #   PII redaction rules (strip email patterns, phone numbers, account numbers from query text)
│   │   │
│   │   │                                # — Not overridable (extend via mappings/ instead) —
│   │   ├── index-mapping.ts             # Default OpenSearch mapping: text fields, knn_vector (384-dim), synonym filter
│   │   │                                #   Clients extend this via mappings/*.mapping.ts — not via overrides/
│   │   │
│   │   │                                # — Internal (consumed by defaults and services, not a client-facing override point) —
│   │   └── query-fragments.ts           # Reusable low-level query clauses (match_all, term, exists) used by query builders
│   │
│   ├── ingest/                          # Ingestion pipeline — four subdirectories by concern
│   │   │                                #   Standard flow:  crawlers/ → extractors/ → pipeline/ (fetch → parse → embed → index)
│   │   │                                #   Feed flow:      pipeline/structured-ingester.ts (self-contained — does not use crawlers/ or extractors/)
│   │   │
│   │   ├── crawlers/                    # How to fetch — one crawler per rendering strategy
│   │   │   ├── static-crawler.ts        # CheerioCrawler for server-rendered HTML; includes runUniversalCrawler() compat wrapper
│   │   │   ├── csr-crawler.ts           # PlaywrightCrawler (lazy-loaded) for JS-rendered pages; supports form-based auth
│   │   │   └── sitemap-seed-resolver.ts # Parses sitemap.xml / sitemap index XML → URL list; provides seed URLs to crawlers
│   │   │
│   │   ├── extractors/                  # How to parse fetched content into indexable text
│   │   │   ├── document-extractor.ts    # Routes binary files (PDF/DOCX/XLSX/PPTX) to the correct parser below
│   │   │   └── parsers/                 # One parser per binary format — each returns plain text
│   │   │       ├── pdf-parser.ts        # PDF → text via pdf-parse
│   │   │       ├── docx-parser.ts       # DOCX → text via mammoth
│   │   │       ├── xlsx-parser.ts       # XLSX/XLS → text via xlsx library (concatenates sheet content)
│   │   │       └── pptx-parser.ts       # PPTX → text via JSZip + XML slide extraction
│   │   │
│   │   ├── pipeline/                    # Orchestration — wires fetch → parse → embed → index
│   │   │   │                            #   NOTE: embed step imports ai/embedding-service (cross-layer dependency — see Dependency Rules)
│   │   │   ├── source-config.ts         # Resolves DataSourceConfig[] for a tenant; creates the appropriate crawler per source
│   │   │   │                            #   (two responsibilities — if this grows, split into source-resolver.ts + crawler-factory.ts)
│   │   │   ├── structured-ingester.ts   # Parallel path: ingests structured feeds (XML/JSON/CSV) directly into OpenSearch
│   │   │   │                            #   Self-contained — fetches, parses, and indexes in one pass; does not use crawlers/ or extractors/
│   │   │   └── content-tracker.ts       # SHA-256 content hashing per URL; gates the index step — skips unchanged content
│   │   │
│   │   └── observability/               # Ingest-time logging and diagnostics — does not affect pipeline behaviour
│   │       ├── crawl-log-writer.ts      # Appends NDJSON crawl events (step / stored / failed / skipped) per tenant per run
│   │       └── debug-log-writer.ts      # Conditional verbose logging per tenant (enabled when config.debug: true)
│   │

├── routes/
│   ├── health.ts                        # GET /health, GET /api/health — returns cluster status + AI service availability checks
│   │
│   ├── admin/                           # /api/admin/* — admin-only routes (require-role: admin)
│   │   ├── index.ts                     # Route registration — mounts all admin handlers; applies requireRole('admin')
│   │   ├── operations.ts               # Index stats, manual crawl trigger, reindex, cluster health
│   │   │                                #   GET  /api/admin/cluster           — OpenSearch cluster health + node stats
│   │   │                                #   POST /api/admin/crawl/:client     — trigger manual crawl for a tenant
│   │   │                                #   POST /api/admin/reindex/:client   — trigger reindex with zero-downtime alias swap
│   │   └── tenants.ts                   # GET  /api/admin/tenants            — list all tenants with status summary
│   │                                    #   GET  /api/admin/tenants/:client   — full config + data source status for one tenant
│   │
│   ├── dashboard/                       # /api/dashboard/* — scoped by auth role
│   │   │                                #   Client role: sees own tenant only. Admin role: sees all tenants + cross-tenant views.
│   │   │                                #   All data endpoints support ?format=json|csv|xml for export (delegates to export-service)
│   │   ├── index.ts                     # Route registration — mounts analytics + search config handlers
│   │   ├── analytics.ts                 # Analytics dashboard API — serves data for graphs and export
│   │   │                                #   GET  /api/dashboard/analytics/:client/overview     — pre-computed KPIs (CTR, zero-results rate, query volume)
│   │   │                                #   GET  /api/dashboard/analytics/:client/queries      — top / zero-result / slow queries with trends
│   │   │                                #   GET  /api/dashboard/analytics/:client/clicks       — CTR by position, time-to-click distribution, dwell time
│   │   │                                #   GET  /api/dashboard/analytics/:client/suggestions  — suggestion accept rate, top suggestions, chars-to-select
│   │   │                                #   GET  /api/dashboard/analytics/:client/filters      — filter usage frequency, zero-results-with-filter rate
│   │   │                                #   GET  /api/dashboard/analytics/:client/rag          — RAG trigger rate, citation clicks, re-search rate
│   │   │                                #   GET  /api/dashboard/analytics/:client/sessions     — session length, refinement chains, outcomes
│   │   │                                #   GET  /api/dashboard/analytics/:client/ingestion    — crawl/push/feed stats, error rates, API call metrics
│   │   │                                #   GET  /api/dashboard/analytics/:client/export       — bulk export raw events (format via ?format=csv|json|xml)
│   │   │                                #   POST /api/dashboard/analytics/:client/aggregate    — trigger on-demand re-computation (admin only)
│   │   └── search-config.ts             # Search configuration dashboard API — read-only view of index setup
│   │                                    #   GET  /api/dashboard/search/:client/indices         — list indices, shard count, doc count, storage size
│   │                                    #   GET  /api/dashboard/search/:client/mappings        — field mappings, analysers, kNN settings per index
│   │   │                                #   GET  /api/dashboard/search/:client/synonyms        — active synonym rules
│   │   │                                #   GET  /api/dashboard/search/:client/pipeline        — search pipeline config (RRF weights, normalisation)
│   │   │                                #   GET  /api/dashboard/search/:client/data-sources    — data source configs, crawl schedules, last-run status
│   │   │                                #   GET  /api/dashboard/search/:client/export          — export full config snapshot (?format=json|xml)
│   │
│   ├── search/                          # /api/search/* — public search API (split by response mode — SSE must be isolated)
│   │   ├── index.ts                     # Route registration only — mounts all handlers below; contains no business logic
│   │   ├── clients.ts                   # GET /api/clients — lists available tenants and their active data sources
│   │   ├── suggest.ts                   # GET /api/suggest/:client — typeahead/autocomplete suggestions from prefix queries
│   │   ├── search.ts                    # POST /api/search/:client — keyword + hybrid search; returns CleanSearchResult[]
│   │   │                                #   Response includes search_id (UUID) — front end sends this back with click/suggestion/filter events
│   │   │                                #   Server-side: writes QueryEvent (or ZeroResultsEvent) to analytics/event-writer on every request
│   │   ├── rag.ts                       # POST /api/rag/:client — RAG pipeline with SSE streaming (retrieval → generation → stream)
│   │   │                                #   Server-side: writes RAGEvent to analytics/event-writer (generation latency, chunks used)
│   │   └── events.ts                    # POST /api/events/:client — client-side event collection endpoint
│   │                                    #   Accepts batched events: ClickEvent, SuggestionEvent, FilterEvent, DwellEvent
│   │                                    #   High-throughput, lightweight — validates schema, drops into analytics/event-writer buffer
│   │                                    #   Client contract: JS snippet or SDK sends events with search_id to tie back to QueryEvent
│   │
│   └── static.ts                        # Serves dashboard frontend assets via @fastify/static
│                                        #   Mounts built output from dashboard/ at /dashboard/*
│                                        #   SPA fallback: all non-API /dashboard/* paths serve index.html

├── clients/                             # Tenant workspaces — one directory per client
│   │                                    #   config.ts    → required. Declares data sources, crawl config, and override manifest.
│   │                                    #   mappings/    → OpenSearch index field definitions (always present)
│   │                                    #   overrides/   → Behavioural overrides for core/defaults/ (optional — absence means all defaults)
│   │
│   │                                    # Override convention:
│   │                                    #   - Each override file implements an interface from core/types/overrides.ts
│   │                                    #   - Override filenames match their core/defaults/ counterpart (query-builder.ts, not queries.ts)
│   │                                    #   - Overrides are declared in config.ts via the overrides manifest — NOT auto-discovered
│   │                                    #   - client-resolver validates each override against its interface at startup
│   │                                    #
│   │                                    # Override strategies:
│   │                                    #   Replace — export a full implementation of the interface. Default is ignored entirely.
│   │                                    #            Use when the client's behaviour is fundamentally different from the default.
│   │                                    #   Extend — import the default, call it, modify the result. Default is used as a base.
│   │                                    #            e.g. import { defaultQueryBuilder } from 'core/defaults/query-builder'
│   │                                    #            then wrap, add boosts, modify filters, etc.
│   │                                    #            This override → default dependency is intentional and safe (see Dependency Rules).
│   │
│   ├── acme/                            # Minimal client — relies entirely on core defaults; no overrides/ directory needed
│   │   ├── config.ts                    # Declares data sources: web (active), news/scholarships/people (stubs — not yet wired)
│   │   │                                #   overrides: not declared → all defaults used
│   │   └── mappings/
│   │       ├── web.mapping.ts           # Main site crawl config: seed URLs, static + CSR strategies, binary file handling
│   │       ├── news.mapping.ts          # RSS/XML news feed config [stub — not yet implemented]
│   │       ├── scholarships.mapping.ts  # Structured data source [stub — not yet implemented]
│   │       └── people.mapping.ts        # Staff directory source [stub — not yet implemented]
│   │
│   └── globex/                          # Reference client — demonstrates every possible override point
│       ├── config.ts                    # Full config: crawl schedule, retrieval strategy, generation model, ranking, theme
│       │                                #   overrides: {
│       │                                #     queryBuilder:    './overrides/query-builder',
│       │                                #     searchAdapter:   './overrides/search-adapter',
│       │                                #     parsePage:       './overrides/parse-page',
│       │                                #   }
│       │                                #   exclude-patterns and analytics-config not declared → defaults used for those
│       ├── mappings/                    # OpenSearch index mappings only — field definitions, analysers, kNN settings
│       │   ├── web.mapping.ts           # Custom index mapping: extends core/defaults/index-mapping.ts with extra fields
│       │   ├── productA.mapping.ts      # Product-specific data source mapping
│       │   ├── productB.mapping.ts      # Product-specific data source mapping
│       │   └── productC.mapping.ts      # Product-specific data source mapping
│       └── overrides/                   # Behavioural overrides — each implements an interface from core/types/overrides.ts
│           ├── query-builder.ts         # Implements QueryBuilder (Replace strategy — full custom query construction)
│           ├── search-adapter.ts        # Implements SearchAdapter (Extend strategy — imports default, adds custom field mapping)
│           └── parse-page.ts            # Implements PageParser (Replace strategy — site-specific CSS selectors)

├── typings/                             # Ambient .d.ts module declarations only — not application domain types (those live in core/types/)
│   └── fastify-cors.d.ts               # Module augmentation for @fastify/cors (adds missing type exports)

├── dashboard/                           # Frontend SPA — served by routes/static.ts at /dashboard/*
│   │                                    #   Built separately (Vite + React); output copied to dist/dashboard/ at build time
│   │                                    #   Auth: login screen → API key entry → role resolved server-side → scoped UI
│   │                                    #   Client login: sees own tenant only. Admin login: tenant selector + cross-tenant views.
│   ├── src/
│   │   ├── api/                         # API client — typed wrappers around /api/dashboard/* endpoints
│   │   │   ├── analytics-api.ts         # Fetches analytics data (overview, queries, clicks, suggestions, filters, rag, sessions)
│   │   │   ├── search-config-api.ts     # Fetches index config data (indices, mappings, synonyms, pipeline, data sources)
│   │   │   └── export-api.ts            # Triggers export downloads (CSV/JSON/XML) via ?format= parameter
│   │   │
│   │   ├── components/                  # Shared UI components
│   │   │   ├── charts/                  # Reusable chart components (line, bar, pie, heatmap) — wraps a charting library
│   │   │   ├── tables/                  # Sortable, filterable data tables with export button
│   │   │   ├── layout/                  # Shell, sidebar, tenant selector (admin only), date-range picker
│   │   │   └── auth/                    # Login form, role-gated route wrapper, session expiry handler
│   │   │
│   │   ├── pages/
│   │   │   ├── analytics/               # Analytics dashboard pages
│   │   │   │   ├── overview.tsx         # KPI cards (CTR, zero-results rate, query volume) + trend graphs
│   │   │   │   ├── queries.tsx          # Top queries, zero-result queries, slow queries — tables + graphs
│   │   │   │   ├── clicks.tsx           # CTR by position heatmap, time-to-click distribution, dwell time
│   │   │   │   ├── suggestions.tsx      # Suggestion accept rate, top suggestions, chars-to-select histogram
│   │   │   │   ├── filters.tsx          # Filter usage frequency, zero-results-with-filter breakdown
│   │   │   │   ├── rag.tsx              # RAG trigger rate, citation click-through, re-search rate
│   │   │   │   ├── sessions.tsx         # Session length distribution, refinement chains, outcome breakdown
│   │   │   │   └── ingestion.tsx        # Crawl/push/feed stats, error rates, API call latency (admin-heavy)
│   │   │   │
│   │   │   └── search-config/           # Search configuration pages
│   │   │       ├── indices.tsx          # Index list with shard count, doc count, storage size
│   │   │       ├── mappings.tsx         # Field mappings, analysers, kNN settings — expandable per-index view
│   │   │       ├── synonyms.tsx         # Synonym rule viewer
│   │   │       ├── pipeline.tsx         # Search pipeline config (RRF weights, normalisation method)
│   │   │       └── data-sources.tsx     # Data source configs, crawl schedules, last-run status + health
│   │   │
│   │   ├── hooks/                       # Custom React hooks (useAnalytics, useDateRange, useExport, useAuth)
│   │   ├── router.tsx                   # Route definitions — role-gated: admin sees tenant selector, client sees single tenant
│   │   └── main.tsx                     # Entry point
│   │
│   ├── public/                          # Static assets (favicon, etc.)
│   ├── index.html                       # SPA shell
│   ├── vite.config.ts                   # Vite config — output to ../dist/dashboard/
│   └── tsconfig.json                    # Separate tsconfig — dashboard types do not leak into server

├── tests/                               # Mirrors src/ structure — scaffold in place, populate as services are implemented
│   ├── unit/
│   │   ├── core/
│   │   │   ├── services/
│   │   │   └── types/
│   │   └── clients/
│   └── integration/
│       ├── opensearch/
│       └── crawl/

└── index.ts                             # Entry point — startup sequence is load-bearing: config → logger → OS client → pipelines → routes → listen
