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
