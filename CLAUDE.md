# Project Conventions

## Layout

| Path | Purpose |
|---|---|
| `src/types/opensearch.ts` | SDK / wire-level types only — no domain concepts |
| `src/types/queries.ts` | Internal query shape types consumed by query builders |
| `src/types/domains.ts` | Business types: Tenant, Document, SearchResult, etc. |
| `src/queries/` | Pure functions that build OpenSearch DSL from domain types |
| `src/adapters/` | Thin wrappers around the OpenSearch client — one per concern |
| `src/services/` | Business logic that orchestrates adapters and query builders |
| `src/index.ts` | Public re-exports only |

## Rules

- **No raw OpenSearch DSL outside `src/queries/`.** Services work with domain types; query builders translate them.
- **No business logic in adapters.** Adapters send requests and map responses — nothing more.
- **Types flow inward.** `domains.ts` must not import from `opensearch.ts` or `queries.ts`. Adapters may import all three.
- **`strict: true` is non-negotiable.** Do not suppress errors with `// @ts-ignore` or casts to `any` without a comment explaining why.
- **Environment via `.env`.** Use `process.env` with explicit fallback/validation at startup; never hardcode URLs or credentials.
- **One export per file in `queries/` and `adapters/`.** Keeps tree-shaking clean and diffs small.
- Language is British English
## Tooling

- `npm run typecheck` — type-check without emitting (CI gate)
- `npm run build` — compile to `dist/`
- `npm run dev` — run `src/index.ts` directly via ts-node

## Recording decisions

Add an entry to `DECISIONS.md` whenever a non-obvious choice is made (library selection, schema design, error-handling strategy, etc.).

## Documentation
- Project documentation lives in `DOCUMENTATION.md` at the project root.
- After every code change, update `DOCUMENTATION.md` to reflect what was added, modified, or removed.
- Include the purpose of the change, not just what changed.
- When explaining concepts or patterns, add them to a "Concepts" section in `DOCUMENTATION.md` so they serve as a permanent reference.


## File Naming Conventions

- Use kebab-case for all TypeScript file names: `query-builder.ts`, `music-adapter.ts`, `client-resolver.ts`
- Use lowercase single words for short, well-known files: `index.ts`, `types.ts`
- Test files must mirror the source file name with a `.test.ts` suffix: `query-builder.test.ts`
- Never use camelCase (`queryBuilder.ts`), PascalCase (`QueryBuilder.ts`), or underscore (`query_builder.ts`) for file names
- Exception: React component files use PascalCase: `MusicCard.tsx`

## Function Naming Conventions

- Use camelCase for all functions and methods: `buildQuery()`, `resolveClient()`, `fetchResults()`
- Use PascalCase for classes and interfaces: `MusicAdapter`, `QueryBuilder`, `SearchClient`
- Boolean-returning functions must start with `is`, `has`, or `can`: `isValidIndex()`, `hasResults()`, `canRetry()`
- Async functions must be descriptive of their action, not their mechanism: `fetchDocument()` not `asyncGetDoc()`
- Event handlers must be prefixed with `on` or `handle`: `onSearchComplete()`, `handleError()`
- Factory functions must be prefixed with `create` or `build`: `createClient()`, `buildQuery()`
- Never use abbreviations unless they are universally understood (`url`, `id`, `api`)

## Variable Naming Conventions

- Use camelCase for all variables and parameters: `clientName`, `indexName`, `searchResults`
- Use SCREAMING_SNAKE_CASE for true constants: `MAX_RETRY_COUNT`, `DEFAULT_INDEX_PREFIX`
- Use PascalCase for type aliases and interfaces: `type SearchResult = ...`, `interface ClientConfig`
- Prefix private class members with an underscore: `_cache`, `_resolver`
- Never use single-letter variable names except for short loop counters (`i`, `j`) or well-known generics (`T`, `K`, `V`)

## TypeScript-Specific Naming

- Interface names must NOT be prefixed with `I`: use `ClientConfig` not `IClientConfig`
- Generic type parameters use single uppercase letters or descriptive PascalCase: `T`, `TResult`, `TQuery`
- Enum names use PascalCase; enum members use SCREAMING_SNAKE_CASE:
  enum SearchMode {
    EXACT_MATCH = 'exact',
    SEMANTIC = 'semantic',
    HYBRID = 'hybrid'
  }
- Type guard functions must be named with `is` prefix and return a type predicate:
  function isSearchResult(val: unknown): val is SearchResult

## Client / Tenant Naming Conventions

- `id` and `collection` use **lowercase underscore** (snake_case): `acme_corp`, `melton_city_council`, `web`, `news`, `products`
- `indexName` is always derived as `${id}_${collection}`: e.g. `acme_corp_news`, `melton_city_council_web`
- Never set `indexName` manually — always derive it; this guarantees consistency and enables `acme_corp_*` wildcard queries across all of a tenant's collections
- `name` is free text for display only: `"ACME Corp"`, `"Melton City Council"`
- Never use hyphens in `id`, `collection`, or `indexName` — they create ambiguity in date-suffixed index patterns (e.g. `acme_corp_2024-01` vs `acme-corp-2024-01`)
- Each `Tenant` instance represents one tenant + one collection — query across collections using the `${id}_*` wildcard pattern

  ## Folder and Module Conventions

- Follow the strict folder structure: src/types/, queries/, adapters/, services/, index.ts
- One primary export per file — the file name must reflect what it exports
- Barrel files (index.ts) are allowed at the folder level to re-export modules
- Never mix concerns in a single file (e.g., do not put adapter logic inside a query file)