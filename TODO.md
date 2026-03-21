# Convention Audit — Upcoming Prompts

Violations found by cross-referencing `PROMPTS.md` against `CLAUDE.md`.
Fix each item before running the relevant prompt.

---

## File Naming (kebab-case)

Prompts that ask you to create camelCase filenames. Rename before creating.

| Prompt | Wrong name | Correct name |
|---|---|---|
| 8.2 | `crawlWorker.ts` | `crawl-worker.ts` |
| 8.2 | `embedWorker.ts` | `embed-worker.ts` |
| 8.2 | `indexWorker.ts` | `index-worker.ts` |
| 8.2 | `startWorkers.ts` | `start-workers.ts` |
| 8.3 | `queueStatus.ts` | `queue-status.ts` |
| 11.1 | `profileQuery.ts` | `profile-query.ts` |
| 11.2 | `embeddingCache.ts` | `embedding-cache.ts` |

---

## Business Logic in `adapters/`

Adapters are thin wrappers around the OpenSearch client only. These prompts place non-client logic there — move them to `src/services/` instead.

| Prompt | File the prompt asks for | Problem | Correct location |
|---|---|---|---|
| 2.2 | `adapters/transformer.ts` | Pure data transformation, no OpenSearch | `services/transformer.ts` |
| 2.4 | `adapters/transformer.ts` | Schema validation is business logic | `services/transformer.ts` |
| 4.1 | `adapters/embeddings.ts` | Calls Ollama, not OpenSearch | `services/embeddings.ts` |
| 7.1 | `adapters/chunker.ts` | Pure text splitting, no OpenSearch | `services/chunker.ts` |
| 7.3 | `adapters/llm.ts` | Prompt building + LLM orchestration | `services/llm.ts` |
| 11.2 | `adapters/embeddingCache.ts` | File I/O cache, no OpenSearch | `services/embedding-cache.ts` |

---

## Domain Types in Wrong File

`SearchResult`, `Tenant`, `Document`, and other business concepts belong in `domains.ts`.
`queries.ts` is only for internal query shape types (inputs to query builder functions).

| Prompt | Type(s) | Prompt puts them in | Should be in |
|---|---|---|---|
| 1.5 | `SearchResult` | `types/queries.ts` | `types/domains.ts` |
| 5.2 | `SearchMode`, `SearchOptions` | `adapters/search.ts` | `types/domains.ts` |
| 7.1 | `Chunk` | `adapters/chunker.ts` | `types/domains.ts` |
| 8.1 | `CrawlJobData`, `EmbedJobData`, `IndexJobData` | `src/queue/types.ts` | `types/domains.ts` |

---

## One Export Per File (adapters/ and queries/)

| Prompt | File | Exports the prompt defines |
|---|---|---|
| 4.1 | `embeddings.ts` | `generateEmbedding` + `generateEmbeddingBatch` — split into two files |
| 7.1 | `chunker.ts` | `chunkDocument` + `chunkDocuments` — split into two files |
| 8.1 | `queues.ts` | `crawlQueue` + `embedQueue` + `indexQueue` — split into three files |

---

## References to Renamed/Split Files

These prompts reference files that no longer exist. Adjust the import paths before following the instructions.

| Prompt | References | Actual file now |
|---|---|---|
| 4.2 | `adapters/indexManager.ts` | `adapters/index-manager.ts` |
| 7.2 | `adapters/indexManager.ts` | `adapters/index-manager.ts` |
| 4.4 | `adapters/search.ts` | Split into `keyword-search.ts`, `phrase-search.ts`, `prefix-search.ts`, `wildcard-search.ts`, `fuzzy-search.ts`, `query-string-search.ts` |
| 5.2 | `adapters/search.ts` | Same as above |
| 10.1 | `adapters/search.ts` | Same as above |

---

## Function Naming

| Prompt | Wrong name | Rule | Correct name |
|---|---|---|---|
| 10.1 | `getLogger(context)` | Factory functions must use `create` or `build` prefix | `createLogger(context)` |

---

## `src/index.ts` Used for Execution Logic

The convention requires `index.ts` to be public re-exports only. These prompts add execution code to it — move that logic to `src/scripts/` once verified working.

- **Prompt 1.3** — asks to call `createTenantIndex('demo')` in `index.ts`
- **Prompt 1.4** — asks to ingest hardcoded documents from `index.ts`
- **Prompt 1.5** — asks to run a keyword search from `index.ts`



----


File Naming (kebab-case violations)

  These prompts ask you to create files with camelCase names:

  ┌────────┬───────────────────┬────────────────────────────────────┐
  │ Prompt │    Wrong name     │            Correct name            │
  ├────────┼───────────────────┼────────────────────────────────────┤
  │ 1.3    │ indexManager.ts   │ index-manager.ts ✅ already fixed  │
  ├────────┼───────────────────┼────────────────────────────────────┤
  │ 3.2    │ testIsolation.ts  │ test-isolation.ts ✅ already fixed │
  ├────────┼───────────────────┼────────────────────────────────────┤
  │ 8.2    │ crawlWorker.ts    │ crawl-worker.ts                    │
  ├────────┼───────────────────┼────────────────────────────────────┤
  │ 8.2    │ embedWorker.ts    │ embed-worker.ts                    │
  ├────────┼───────────────────┼────────────────────────────────────┤
  │ 8.2    │ indexWorker.ts    │ index-worker.ts                    │
  ├────────┼───────────────────┼────────────────────────────────────┤
  │ 8.2    │ startWorkers.ts   │ start-workers.ts                   │
  ├────────┼───────────────────┼────────────────────────────────────┤
  │ 8.3    │ queueStatus.ts    │ queue-status.ts                    │
  ├────────┼───────────────────┼────────────────────────────────────┤
  │ 11.1   │ profileQuery.ts   │ profile-query.ts                   │
  ├────────┼───────────────────┼────────────────────────────────────┤
  │ 11.2   │ embeddingCache.ts │ embedding-cache.ts                 │
  └────────┴───────────────────┴────────────────────────────────────┘

  ---
  Business logic in adapters/ (Rule: adapters are OpenSearch client wrappers only)
                                                                                                                                                                  
  These prompts put logic into adapters/ that has nothing to do with the OpenSearch client:
                                                                                                                                                                    ┌────────┬───────────────────┬──────────────────────────────────────────┬─────────────────────────────┐                                                           │ Prompt │       File        │               What's wrong               │     Where it should go      │                                                         
  ├────────┼───────────────────┼──────────────────────────────────────────┼─────────────────────────────┤                                                           │ 2.2    │ transformer.ts    │ Pure data transformation, no OpenSearch  │ src/services/               │
  ├────────┼───────────────────┼──────────────────────────────────────────┼─────────────────────────────┤                                                         
  │ 2.4    │ transformer.ts    │ Schema validation is business logic      │ src/services/               │                                                         
  ├────────┼───────────────────┼──────────────────────────────────────────┼─────────────────────────────┤                                                           │ 4.1    │ embeddings.ts     │ Calls Ollama, not OpenSearch             │ src/services/               │                                                         
  ├────────┼───────────────────┼──────────────────────────────────────────┼─────────────────────────────┤                                                           │ 7.1    │ chunker.ts        │ Pure text splitting logic, no OpenSearch │ src/services/               │
  ├────────┼───────────────────┼──────────────────────────────────────────┼─────────────────────────────┤                                                           │ 7.3    │ llm.ts            │ Prompt building + LLM orchestration      │ src/services/               │
  ├────────┼───────────────────┼──────────────────────────────────────────┼─────────────────────────────┤                                                           │ 11.2   │ embeddingCache.ts │ File I/O cache, no OpenSearch            │ src/services/ or src/utils/ │
  └────────┴───────────────────┴──────────────────────────────────────────┴─────────────────────────────┘                                                            
  ---                                                                                                                                                             
  Domain types placed in the wrong file
                                                                                                                                                                  
  The rule: SearchResult, Tenant, Document etc. belong in domains.ts. queries.ts is only for internal query shapes (the inputs to query builder functions).
                                                                                                                                                                    ┌────────┬──────────────────────────────────────────┬─────────────────────┬──────────────┐                                                                        │ Prompt │                   Type                   │      Placed in      │ Should be in │                                                                      
  ├────────┼──────────────────────────────────────────┼─────────────────────┼──────────────┤                                                                      
  │ 1.5    │ SearchResult                             │ queries.ts          │ domains.ts   │
  ├────────┼──────────────────────────────────────────┼─────────────────────┼──────────────┤
  │ 5.2    │ SearchMode, SearchOptions                │ adapters/search.ts  │ domains.ts   │                                                                      
  ├────────┼──────────────────────────────────────────┼─────────────────────┼──────────────┤                                                                        │ 7.1    │ Chunk                                    │ adapters/chunker.ts │ domains.ts   │                                                                      
  ├────────┼──────────────────────────────────────────┼─────────────────────┼──────────────┤                                                                        │ 8.1    │ CrawlJobData, EmbedJobData, IndexJobData │ src/queue/types.ts  │ domains.ts   │
  └────────┴──────────────────────────────────────────┴─────────────────────┴──────────────┘                                                                         
  ---                                                                                                                                                             
  One export per file violations (adapters/ and queries/)
                                                                                                                                                                  
  ┌────────┬───────────────┬─────────────────────────────────────────────┐
  │ Prompt │     File      │                   Exports                   │                                                                                          ├────────┼───────────────┼─────────────────────────────────────────────┤
  │ 4.1    │ embeddings.ts │ generateEmbedding + generateEmbeddingBatch  │                                                                                        
  ├────────┼───────────────┼─────────────────────────────────────────────┤
  │ 7.1    │ chunker.ts    │ Chunk type + chunkDocument + chunkDocuments │                                                                                        
  ├────────┼───────────────┼─────────────────────────────────────────────┤                                                                                          │ 8.1    │ queues.ts     │ crawlQueue + embedQueue + indexQueue        │                                                                                        
  └────────┴───────────────┴─────────────────────────────────────────────┘                                                                                                                                 
  ---                                                                                                                                                             
  References to old filenames (already renamed by us)
                                                                                                                                                                    These prompts will reference paths that no longer exist:
                                                                                                                                                                    ┌────────┬──────────────────────────┬───────────────────────────┐                                                                                                 │ Prompt │        References        │      Actual file now      │
  ├────────┼──────────────────────────┼───────────────────────────┤                                                                                               
  │ 4.2    │ adapters/indexManager.ts │ adapters/index-manager.ts │
  ├────────┼──────────────────────────┼───────────────────────────┤
  │ 7.2    │ adapters/indexManager.ts │ adapters/index-manager.ts │                                                                                               
  ├────────┼──────────────────────────┼───────────────────────────┤                                                                                                 │ 4.4    │ adapters/search.ts       │ split into 6 files        │                                                                                               
  ├────────┼──────────────────────────┼───────────────────────────┤                                                                                                 │ 5.2    │ adapters/search.ts       │ split into 6 files        │
  ├────────┼──────────────────────────┼───────────────────────────┤                                                                                                 │ 10.1   │ adapters/search.ts       │ split into 6 files        │
  └────────┴──────────────────────────┴───────────────────────────┘                                                                                                  
  ---                                                                                                                                                             
  Function naming (Prompt 10.1)
                                                                                                                                                                  
  getLogger() violates the factory function rule — factory functions must use create or build prefix.
                                                                                                                                                                    - Wrong: getLogger(context: string)                                                                                                                               - Correct: createLogger(context: string)                                                                                                                        
                                                                                                                                                                    ---                                    
  src/index.ts used as an entry point with execution logic                                                                                                                                                                                                                                                                          
  The rule says index.ts is public re-exports only. Several early prompts treat it as a run script:
                                                                                                                                                                    - Prompt 1.3 — call createTenantIndex('demo') and log the outcome                                                                                                 - Prompt 1.4 — ingest these 5 hardcoded test documents                                                                                                          
  - Prompt 1.5 — run a keyword search and print the results                                                                                                       
                                                                                                                                                                    For these learning prompts it's fine to use index.ts temporarily, but know the convention requires moving execution logic to src/scripts/ once you've verified    it works.                                                                                                                                                       
                                                                                                                                                                  
  ---                                    
  Summary: highest-priority items to watch for
                                                                                                                                                                  
  1. Always check filenames — if a prompt gives a camelCase file name, convert it to kebab-case before creating it
  2. If a prompt says src/adapters/ for something that doesn't call the OpenSearch client — move it to src/services/ instead                                      
  3. When a prompt says to add a new type, check whether it's a business concept (→ domains.ts) or a query shape (→ queries.ts)                                   
  4. Phase 5.2 onward — search.ts no longer exists; the prompt's instructions will need to be redistributed across the individual search adapter files           