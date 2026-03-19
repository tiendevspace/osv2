# Multi-Tenant OpenSearch Application — Build Prompts

> **How to use this file**
> Each prompt is a self-contained instruction to paste into Claude Code (or your AI assistant of choice).
> Never move to the next prompt until the current one is fully working and you understand every line.
> If a prompt produces code you don't understand, paste it back with: _"Explain this line by line before we continue."_

---

## Ground Rules (read before every session)

- One prompt = one working, testable slice. Never combine two.
- After every prompt: read the generated code, then ask "why" for anything unclear.
- Your learning contract: write the file yourself first, then use the prompt to critique it.
- Commit after every green state. Never build on broken code.

---

## PHASE 1 — Foundation

### Month 1 · Walking Skeleton

---

#### Prompt 1.1 — Project Scaffold

```
I am building a multi-tenant OpenSearch application in TypeScript.
The project is a monorepo. I am a beginner in both TypeScript and OpenSearch,
so I need every decision explained clearly.

Set up the following folder structure only — no implementation code yet:

src/
  types/
    opensearch.ts     ← OpenSearch client and response types
    queries.ts        ← Query shape types
    domains.ts        ← Domain/business types (Tenant, Document, etc.)
  queries/            ← Query builder functions
  adapters/           ← OpenSearch client wrappers
  services/           ← Business logic
  index.ts            ← Entry point (empty for now)

Also create:
  package.json        ← TypeScript, ts-node, @opensearch-project/opensearch
  tsconfig.json       ← Strict mode, ES2022, NodeNext modules
  .env.example        ← OPENSEARCH_URL, OPENSEARCH_USERNAME, OPENSEARCH_PASSWORD
  DECISIONS.md        ← Empty template with headings: Decision, Alternatives, Rationale
  CLAUDE.md           ← Project conventions summary

For each file, explain:
1. Why it exists
2. What will eventually live in it
3. What the TypeScript config option does (for tsconfig.json)

Do not write any search or OpenSearch logic yet.
```

---

#### Prompt 1.2 — OpenSearch Client Connection

```
I now have my folder structure in place.

In src/adapters/, create a file called client.ts that:
1. Reads OPENSEARCH_URL, OPENSEARCH_USERNAME, OPENSEARCH_PASSWORD from environment variables
2. Creates and exports a single OpenSearch client instance using @opensearch-project/opensearch
3. Exports a testConnection() function that pings the cluster and logs whether it succeeded or failed

In src/types/opensearch.ts, define:
- A type for the OpenSearch client instance
- A type for a basic cluster health response

Then in src/index.ts, call testConnection() and log the result.

Rules:
- Use async/await throughout, no raw Promises
- Handle the case where environment variables are missing (throw a descriptive error)
- No hardcoded credentials anywhere

Explain what the OpenSearch client is doing under the hood when it connects,
and why we isolate it in an adapter rather than using it directly everywhere.

Create a new file called DOCUMENTATION.md and include your explanation in the file. Keep it updated each time you make changes to the codes
```

---

#### Prompt 1.3 — Index Creation & Field Mappings

```
I can connect to OpenSearch. Now I need to create an index for a single tenant.

In src/adapters/, create a file called indexManager.ts that exports:
1. createTenantIndex(tenantId: string): Promise<void>
   - Creates an index named tenant_{tenantId}_documents
   - Defines explicit mappings for these fields:
       title:      text (analysed for full-text search)
       body:       text (analysed for full-text search)
       url:        keyword (exact match only, not analysed)
       created_at: date
       tenant_id:  keyword
   - Sets number_of_shards: 1, number_of_replicas: 0 for local development
2. indexExists(tenantId: string): Promise<boolean>
   - Returns true if the index already exists

In src/types/domains.ts, define:
- A Tenant type: { id: string; name: string }
- A Document type matching the fields above

In src/index.ts, call createTenantIndex('demo') and log the outcome.

Explain:
- The difference between text and keyword field types in OpenSearch
- Why we name the index tenant_{id}_documents instead of just using one shared index
- What shards and replicas are, in plain language
```

---

#### Prompt 1.4 — Manual Document Ingestion

```
My index exists. I want to put documents into it.

In src/adapters/, create a file called ingest.ts that exports:
1. indexDocument(tenantId: string, doc: Document): Promise<void>
   - Indexes a single document into tenant_{tenantId}_documents
   - Generates a document ID from the URL (use a simple hash or slugify)
2. bulkIndexDocuments(tenantId: string, docs: Document[]): Promise<void>
   - Uses the OpenSearch bulk API to index multiple documents efficiently
   - Logs how many succeeded and how many failed

In src/index.ts, ingest these 5 hardcoded test documents into the 'demo' tenant:
[provide 5 simple objects with title, body, url, created_at, tenant_id fields]

Explain:
- What the bulk API is and why it is more efficient than indexing one by one
- What a document ID is in OpenSearch and how OpenSearch uses it
- What happens if you index a document with the same ID twice
```

---

#### Prompt 1.5 — First BM25 Keyword Search

```
I have documents in my index. Now I want to search them.

In src/queries/, create a file called keyword.ts that exports:
1. buildKeywordQuery(searchTerm: string): object
   - Returns an OpenSearch query DSL object using a multi_match query
   - Searches across title and body fields
   - Boosts title matches higher than body matches (use ^2 notation)

In src/adapters/, create a file called search.ts that exports:
1. keywordSearch(tenantId: string, searchTerm: string): Promise<SearchResult[]>
   - Executes the keyword query against tenant_{tenantId}_documents
   - Returns a typed array of SearchResult objects

In src/types/queries.ts, define:
- KeywordQuery type
- SearchResult type: { id: string; title: string; url: string; score: number }

In src/index.ts, run a keyword search for "your test term here" against the 'demo'
tenant and print the results.

Explain:
- What BM25 is and how it scores results (plain language, no maths)
- What multi_match does versus a standard match query
- What field boosting means and why we boost the title field
```

---

### Month 2 · Ingestion Pipeline

---

#### Prompt 2.1 — Crawlee Basic HTTP Crawler

```
I want to replace hardcoded documents with a real web crawler.

Install Crawlee and set it up for basic HTTP crawling (CheerioCrawler).

In src/services/, create a file called crawler.ts that exports:
1. crawlUrl(startUrl: string): Promise<RawPage[]>
   - Crawls a single starting URL
   - Follows links on the same domain up to a depth of 2
   - For each page, extracts: url, title (from <title> tag), body (from <p> tags joined),
     and crawled_at timestamp
   - Returns an array of RawPage objects

In src/types/domains.ts, add:
- RawPage type: { url: string; title: string; body: string; crawled_at: string }

Do not connect this to OpenSearch yet. Just log the raw output to the console.

Explain:
- What Crawlee's CheerioCrawler does differently from a fetch() call
- What crawl depth means and why we limit it
- Why we keep raw crawl output separate from our Document type
```

---

#### Prompt 2.2 — Document Transformer

```
I can crawl pages and get RawPage objects. Now I need to transform them into
indexed Documents.

In src/adapters/, create a file called transformer.ts that exports:
1. transformPage(raw: RawPage, tenantId: string): Document
   - Maps RawPage fields to Document fields
   - Truncates body to 10,000 characters maximum
   - Sets tenant_id from the tenantId parameter
   - Sets created_at to crawled_at

2. transformPages(raws: RawPage[], tenantId: string): Document[]
   - Maps an array using transformPage
   - Filters out pages where title or body is empty

Explain:
- Why we have a separate transformer instead of transforming inside the crawler
- What the single responsibility principle means and how it applies here
- Why we need to guard against empty title/body fields
```

---

#### Prompt 2.3 — End-to-End Ingest Script

```
I have a crawler and a transformer. Now I want to wire them into a single
command that I can run from the terminal.

Create a script at src/scripts/ingest.ts that:
1. Accepts a --tenant flag and a --url flag from the command line
   e.g. ts-node src/scripts/ingest.ts --tenant=demo --url=https://example.com
2. Calls crawlUrl() with the provided URL
3. Passes raw pages through transformPages()
4. Calls bulkIndexDocuments() with the transformed documents
5. Logs a summary: tenant, URL, pages crawled, documents indexed, errors

Add a script to package.json:
  "ingest": "ts-node src/scripts/ingest.ts"

So I can run: npm run ingest -- --tenant=demo --url=https://example.com

Explain:
- How process.argv works and how we parse CLI flags from it
- Why we log a summary rather than individual document logs
- What error handling we should add at each stage of the pipeline
```

---

#### Prompt 2.4 — Schema Validation

```
Before a document is indexed, I want to validate it conforms to the expected schema.

In src/adapters/transformer.ts, add a function:
1. validateDocument(doc: Document): { valid: boolean; errors: string[] }
   - Checks that title is non-empty and under 500 characters
   - Checks that url is a valid URL format
   - Checks that tenant_id is non-empty
   - Checks that created_at is a parseable date string
   - Returns all validation errors, not just the first one

Update bulkIndexDocuments() to:
- Run validateDocument() on each document before indexing
- Skip invalid documents
- Include invalid document count in the summary log

Explain:
- Why we validate before indexing rather than relying on OpenSearch mappings
- What "fail fast" means in the context of data pipelines
- The difference between throwing an error and returning an error object
```

---

### Month 3 · Multi-Tenancy Scaffolding

---

#### Prompt 3.1 — Tenant Config Schema

```
I want every tenant to be defined by configuration, not hardcoded logic.

In src/types/domains.ts, extend the Tenant type to:
  {
    id: string
    name: string
    sourceUrl: string        ← URL to crawl
    indexName: string        ← derived as tenant_{id}_documents
    fieldWeights?: {         ← optional per-tenant BM25 boost config
      title?: number
      body?: number
    }
  }

Create a file at src/config/tenants.ts that:
1. Exports an array of Tenant objects (hardcode 2 tenants for now)
2. Exports getTenant(tenantId: string): Tenant | undefined
3. Exports getAllTenants(): Tenant[]

Update indexManager.ts and search.ts to accept a Tenant object
instead of a plain tenantId string wherever that makes the code clearer.

Explain:
- Why we derive indexName from the tenant ID rather than letting users set it freely
- What optional properties are in TypeScript (the ? syntax)
- Why we export individual accessor functions rather than just exporting the array
```

---

#### Prompt 3.2 — Tenant Isolation Test

```
I have two tenants in config. I need to prove they are fully isolated.

In src/scripts/, create a file called testIsolation.ts that:
1. Provisions both tenant indices (calls createTenantIndex for each)
2. Ingests 3 documents into Tenant A, 3 different documents into Tenant B
3. Searches for a term that only exists in Tenant A's documents
4. Asserts that results contain only Tenant A documents
5. Searches for a term that only exists in Tenant B's documents
6. Asserts that results contain only Tenant B documents
7. Logs PASS or FAIL with details

Add to package.json:
  "test:isolation": "ts-node src/scripts/testIsolation.ts"

Explain:
- What tenant isolation means at the index level in OpenSearch
- Why we test this explicitly rather than assuming it works
- The difference between index-per-tenant and a shared index filtered by tenant_id field
  (explain both approaches and why we chose index-per-tenant)
```

---

#### Prompt 3.3 — Provisioning Script

```
I want a single command to set up a new tenant from scratch.

In src/scripts/, create a file called provision.ts that:
1. Accepts a --tenant flag
2. Looks up the tenant from the config in tenants.ts
3. Checks if the index already exists (use indexExists())
4. If it exists, logs a warning and asks for --force flag to overwrite
5. Creates the index with the correct mappings
6. Logs the full tenant configuration that was applied

Add to package.json:
  "provision": "ts-node src/scripts/provision.ts"

Also update DECISIONS.md with an entry explaining the index-per-tenant decision:
- What we decided
- What the alternative was (shared index with tenant_id filter)
- Why we chose index-per-tenant

Explain:
- What idempotency means and why our provision script should be idempotent
- What the --force flag pattern is and why it protects against accidental overwrites
```

---

## PHASE 2 — Search Quality

### Month 4 · Semantic Search

---

#### Prompt 4.1 — Ollama Connection & Embedding Function

```
I want to add semantic search using vector embeddings. I am running Ollama locally
with the nomic-embed-text model.

In src/adapters/, create a file called embeddings.ts that exports:
1. generateEmbedding(text: string): Promise<number[]>
   - Calls the Ollama API at http://localhost:11434/api/embeddings
   - Uses the nomic-embed-text model
   - Returns the embedding as an array of numbers
   - Times out after 10 seconds and throws a descriptive error

2. generateEmbeddingBatch(texts: string[]): Promise<number[][]>
   - Calls generateEmbedding for each text sequentially (not in parallel, to avoid
     overwhelming Ollama)
   - Logs progress: "Embedding 3 of 47..."

Add OLLAMA_URL to .env.example.

Explain:
- What an embedding is in plain language (no linear algebra)
- Why we call Ollama sequentially rather than in parallel
- What the dimensions of a nomic-embed-text embedding are and why that matters
```

---

#### Prompt 4.2 — Add Vector Field to Index Mapping

```
I need to update my index mapping to store vector embeddings.

Update createTenantIndex() in src/adapters/indexManager.ts to add:
  embedding: {
    type: "knn_vector",
    dimension: 768,
    method: {
      name: "hnsw",
      space_type: "cosine",
      engine: "nmslib"
    }
  }

Important: this changes the index mapping. Existing indices need to be deleted
and re-created. Update the provision script to handle this cleanly.

Also update the Document type in src/types/domains.ts to include:
  embedding?: number[]   ← optional so non-embedded docs remain valid

Explain:
- What knn_vector type is and how it differs from a regular numeric field
- What HNSW is (plain language — approximate nearest neighbour index)
- What cosine similarity is and why we use it over Euclidean distance
- Why the dimension must exactly match what nomic-embed-text produces
```

---

#### Prompt 4.3 — Embed Documents at Ingest Time

```
When ingesting documents, I want to generate and store embeddings.

Update the ingest pipeline:
1. In transformer.ts, add a parameter embedContent: boolean to transformPage()
2. In src/scripts/ingest.ts, after transforming pages, call generateEmbeddingBatch()
   on the title + body of each document and attach the result to each Document object
3. Update bulkIndexDocuments() to include the embedding field when present

Add a --no-embed flag to the ingest script that skips embedding generation
(useful for fast re-ingestion during testing).

Explain:
- Why we concatenate title and body for the embedding rather than embedding them separately
- What the performance cost of embedding is per document (rough estimate)
- Why we make embedding optional rather than mandatory
```

---

#### Prompt 4.4 — kNN Search Query

```
I can store embeddings. Now I want to search using them.

In src/queries/, create a file called semantic.ts that exports:
1. buildKnnQuery(embedding: number[], k: number): object
   - Returns an OpenSearch kNN query DSL object
   - k is the number of nearest neighbours to return (default 10)

In src/adapters/search.ts, add:
2. semanticSearch(tenantId: string, searchTerm: string): Promise<SearchResult[]>
   - Generates an embedding for the search term using generateEmbedding()
   - Executes the kNN query against the tenant index
   - Returns typed SearchResult[]

In src/scripts/, create compareSearch.ts:
   - Accepts --tenant and --query flags
   - Runs both keywordSearch() and semanticSearch() for the same query
   - Prints both result lists side by side for manual comparison

Add to package.json:
  "compare": "ts-node src/scripts/compareSearch.ts"

Explain:
- How a kNN query works differently from a BM25 query at query time
- What k means and how changing it affects results
- Why semantic search might return different results than keyword search for the same term
```

---

### Month 5 · Hybrid Search

---

#### Prompt 5.1 — RRF Implementation

```
I want to combine BM25 and kNN results into a single ranked list using
Reciprocal Rank Fusion (RRF).

In src/queries/, create a file called hybrid.ts that exports:
1. reciprocalRankFusion(
     bm25Results: SearchResult[],
     knnResults: SearchResult[],
     k?: number
   ): SearchResult[]

The RRF formula for a document d is:
  score(d) = Σ 1 / (k + rank(d, list))
  where k defaults to 60 (standard RRF constant)

The function should:
- Merge both lists
- For each document, sum its RRF score from both lists
- Return documents sorted by RRF score descending
- Preserve the original BM25 and kNN scores as metadata fields

Explain the RRF formula step by step before writing any code.
Then explain:
- Why k=60 is the standard default
- What happens to a document that appears in only one result list
- Why RRF is preferred over simple score normalisation
```

---

#### Prompt 5.2 — Unified Search Endpoint

```
I want a single search function that supports three modes: bm25, semantic, hybrid.

In src/adapters/search.ts, create:
1. A SearchMode type: "bm25" | "semantic" | "hybrid"
2. A SearchOptions type: { mode: SearchMode; limit?: number }
3. search(tenantId: string, query: string, options: SearchOptions): Promise<SearchResult[]>
   - If mode is "bm25": calls keywordSearch()
   - If mode is "semantic": calls semanticSearch()
   - If mode is "hybrid": calls both in parallel using Promise.all(), then applies RRF
   - Defaults limit to 10

Update compareSearch.ts to run all three modes and print results in three columns.

Explain:
- Why we run BM25 and kNN in parallel for hybrid mode rather than sequentially
- What Promise.all() does and what happens if one of the promises rejects
- What the SearchOptions pattern gives us over individual function parameters
```

---

#### Prompt 5.3 — Fastify HTTP Server

```
I want to expose search over HTTP so it can be called from a frontend.

Install Fastify. In src/, create a file called server.ts that:
1. Creates a Fastify instance with JSON logging enabled
2. Registers a route: GET /search
   - Query params: tenantId (required), q (required), mode (optional, default "hybrid")
   - Validates params are present, returns 400 with a message if missing
   - Calls search() and returns the results as JSON
3. Adds a health check route: GET /health
   - Calls testConnection() and returns { status: "ok" } or { status: "error" }
4. Starts on PORT from environment variable, defaults to 3000

Update src/index.ts to start the server.

Explain:
- What Fastify is and why we use it over plain Node http
- What route parameter validation means and why it matters
- What JSON logging is and why structured logs are better than console.log in a server
```

---

### Month 6 · Evaluation Harness

---

#### Prompt 6.1 — Qrels File Structure

```
I want to evaluate search quality using relevance judgements.

In src/evaluation/, create a file called types.ts that defines:
1. RelevanceGrade: 0 | 1 | 2 | 3
   (0 = not relevant, 1 = marginally relevant, 2 = relevant, 3 = highly relevant)
2. Qrel: { queryId: string; documentUrl: string; grade: RelevanceGrade }
3. Query: { id: string; text: string; tenantId: string }
4. QrelsFile: { queries: Query[]; qrels: Qrel[] }

In src/evaluation/, create a sample file called qrels.json with:
- 5 test queries for your demo tenant
- 3–5 relevance judgements per query (you fill in the values manually)

In src/evaluation/, create a loader: loadQrels(path: string): Promise<QrelsFile>

Explain:
- What a qrels file is and where the concept comes from (information retrieval research)
- What the four relevance grades mean in practice
- Why we assign grades manually rather than generating them automatically
```

---

#### Prompt 6.2 — NDCG@10 Implementation

```
I want to compute NDCG@10 for a set of search results against my qrels.

In src/evaluation/, create a file called metrics.ts that exports:
1. dcg(grades: number[], k: number): number
   - Computes Discounted Cumulative Gain for the top-k results
   - Formula: Σ (2^grade - 1) / log2(rank + 1)

2. idcg(grades: number[], k: number): number
   - Computes the Ideal DCG (grades sorted descending)

3. ndcg(retrievedUrls: string[], qrels: Qrel[], queryId: string, k: number): number
   - Maps retrieved URLs to their relevance grades using qrels
   - Computes DCG@k and IDCG@k
   - Returns NDCG@k = DCG@k / IDCG@k
   - Returns 0 if IDCG is 0

4. meanReciprocalRank(results: Array<{ url: string; queryId: string }[]>, qrels: Qrel[]): number
   - Computes MRR across multiple queries

Explain each formula step by step in comments inside the functions.
Then explain what a "good" NDCG score looks like in practice.
```

---

#### Prompt 6.3 — Evaluation Runner Script

```
I want a script that runs my full test query set and reports NDCG@10 and MRR.

In src/scripts/, create evaluate.ts that:
1. Loads qrels.json
2. For each query in the qrels file:
   a. Runs search() in all three modes (bm25, semantic, hybrid)
   b. Computes NDCG@10 for each mode's results
3. Computes mean NDCG@10 across all queries for each mode
4. Computes MRR for each mode
5. Outputs a table to the console:

   Mode       NDCG@10    MRR
   ────────   ───────    ───
   bm25       0.xx       0.xx
   semantic   0.xx       0.xx
   hybrid     0.xx       0.xx

6. Writes results to src/evaluation/baseline.json with a timestamp

Add to package.json:
  "evaluate": "ts-node src/scripts/evaluate.ts"

Explain:
- Why we record a baseline.json rather than just printing to the console
- What it means if hybrid scores lower than bm25 on your test set
- Why 5 queries is too few for reliable evaluation (and what a better number is)
```

---

## PHASE 3 — LLM Integration & Scale

### Month 7 · RAG Pipeline

---

#### Prompt 7.1 — Document Chunking

```
Before building the RAG pipeline, I need to split long documents into chunks.

In src/adapters/, create a file called chunker.ts that exports:
1. A Chunk type: { id: string; parentUrl: string; tenantId: string;
                   title: string; body: string; chunkIndex: number; embedding?: number[] }

2. chunkDocument(doc: Document, maxTokens?: number): Chunk[]
   - Splits doc.body into paragraphs (split on double newline)
   - Groups paragraphs into chunks not exceeding maxTokens (default: 512)
   - Estimate token count as: characterCount / 4 (rough approximation)
   - Each chunk inherits the parent document's url, title, and tenantId
   - Assigns a sequential chunkIndex

3. chunkDocuments(docs: Document[], maxTokens?: number): Chunk[]
   - Maps chunkDocument over an array

Explain:
- Why we chunk documents rather than embedding the full text
- What a token is and why we use character / 4 as an approximation
- What we lose and gain by splitting on paragraphs versus fixed-size windows
```

---

#### Prompt 7.2 — Chunk Index & Re-Ingestion

```
I need a separate index for chunks with their embeddings.

Update indexManager.ts to add:
1. createChunkIndex(tenantId: string): Promise<void>
   - Creates an index named tenant_{tenantId}_chunks
   - Field mappings: id, parentUrl, title, body, chunkIndex, tenantId, embedding (knn_vector, 768d)

2. Update the ingest pipeline in src/scripts/ingest.ts:
   - After indexing documents into tenant_{id}_documents as before
   - Also chunk the documents with chunkDocument()
   - Embed each chunk body using generateEmbedding()
   - Bulk-index chunks into tenant_{id}_chunks

Update provision.ts to create both indices for a tenant.

Explain:
- Why we keep a documents index and a chunks index rather than replacing one with the other
- How the parentUrl field links a chunk back to its source document
- What the storage cost of embeddings is at scale (rough estimate per 1000 documents)
```

---

#### Prompt 7.3 — Context Builder & LLM Call

```
I want to retrieve relevant chunks and send them to an LLM to generate an answer.

In src/adapters/, create a file called llm.ts that exports:
1. buildContextPrompt(query: string, chunks: Chunk[]): string
   - Formats a RAG prompt:
     "Answer the following question using only the provided context.
      If the answer is not in the context, say so.

      Context:
      [chunk 1 title]: [chunk 1 body]
      [chunk 2 title]: [chunk 2 body]
      ...

      Question: [query]
      Answer:"

2. generateAnswer(prompt: string): Promise<string>
   - Calls Ollama with the llama3.1 model
   - Uses the /api/generate endpoint
   - Returns the generated text

In src/services/, create a file called rag.ts that exports:
1. ragSearch(tenantId: string, query: string): Promise<{ answer: string; sources: Chunk[] }>
   - Embeds the query
   - Runs kNN search against tenant_{tenantId}_chunks (top 5 chunks)
   - Builds a context prompt from the retrieved chunks
   - Calls generateAnswer()
   - Returns the answer and the source chunks for citation

Explain:
- Why we pass chunks as context rather than full documents
- What "grounding" means in the context of RAG
- What happens when the LLM is asked something not in the retrieved chunks
```

---

#### Prompt 7.4 — RAG Fastify Route with Streaming

```
I want to expose the RAG pipeline over HTTP with a streaming response.

In src/server.ts, add a new route: GET /search/rag
- Query params: tenantId (required), q (required)
- Uses Fastify's reply.raw to stream the response as Server-Sent Events (SSE)
- Calls ragSearch() and streams:
    data: {"type":"source","url":"...","title":"..."}\n\n   ← for each source chunk
    data: {"type":"answer","text":"..."}\n\n                ← full answer
    data: {"type":"done"}\n\n                              ← end of stream
- Sets Content-Type: text/event-stream header

Explain:
- What Server-Sent Events are and how they differ from WebSockets
- What reply.raw means in Fastify and why we use it instead of reply.send()
- Why we send sources before the answer
```

---

### Month 8 · Async Ingestion

---

#### Prompt 8.1 — BullMQ Setup & Job Types

```
I want to move ingestion off the main process and into a background job queue.

Install BullMQ and ioredis.

In src/queue/, create a file called types.ts defining these job data types:
1. CrawlJobData:   { tenantId: string; url: string; jobId: string }
2. EmbedJobData:   { tenantId: string; documentId: string; text: string; jobId: string }
3. IndexJobData:   { tenantId: string; document: Document; jobId: string }

In src/queue/, create a file called queues.ts that:
1. Creates and exports three BullMQ queues: crawlQueue, embedQueue, indexQueue
2. Reads REDIS_URL from environment variables
3. Sets default job options: attempts: 3, backoff: { type: "exponential", delay: 1000 }

Add REDIS_URL to .env.example.

Explain:
- What a job queue is and why it is better than running ingestion synchronously
- What exponential backoff means and why it is important for retry logic
- What the relationship between a Queue, a Worker, and a Job is in BullMQ
```

---

#### Prompt 8.2 — Workers

```
I have queues. Now I need workers to process the jobs.

In src/queue/workers/, create three worker files:

1. crawlWorker.ts
   - Processes CrawlJobData
   - Calls crawlUrl() for the given URL
   - For each crawled page, adds an IndexJobData job to indexQueue
   - Logs page count on completion

2. embedWorker.ts
   - Processes EmbedJobData
   - Calls generateEmbedding() for the given text
   - Updates the document in OpenSearch with the embedding field
   - (Use an OpenSearch update call, not a full re-index)

3. indexWorker.ts
   - Processes IndexJobData
   - Validates the document
   - Calls indexDocument()
   - If the document has no embedding, adds an EmbedJobData job to embedQueue

In src/queue/, create a file called startWorkers.ts that starts all three workers.

Explain:
- Why each worker adds jobs to the next queue rather than calling the next function directly
- What "fan-out" means in a pipeline like this
- What happens to a job if the worker crashes mid-processing
```

---

#### Prompt 8.3 — Dead-Letter Queue & Monitoring

```
I want to handle permanently failed jobs and monitor queue health.

1. In src/queue/queues.ts, add a failedQueue for each queue type.
   When a job exhausts all retries, move it to the appropriate failed queue
   with the error message attached.

2. In src/scripts/, create a file called queueStatus.ts:
   - Prints a status table to the console:
     Queue       Waiting   Active   Completed   Failed
     ─────────   ───────   ──────   ─────────   ──────
     crawl       x         x        x           x
     embed       x         x        x           x
     index       x         x        x           x
   - Accepts an optional --watch flag that refreshes every 5 seconds

3. Add to package.json:
   "queue:status": "ts-node src/scripts/queueStatus.ts"

Explain:
- What a dead-letter queue is and why we don't just discard failed jobs
- What the difference is between a transient failure and a permanent failure
- How you would inspect and replay a failed job manually
```

---

### Month 9 · Multi-Tenant Expansion

---

#### Prompt 9.1 — Tenant Config File (JSON-Driven)

```
I want all tenant configuration driven by a single JSON file, with no tenants
hardcoded in TypeScript.

Create src/config/tenants.json with this structure:
{
  "tenants": [
    {
      "id": "tenant-a",
      "name": "Tenant A",
      "sourceUrls": ["https://example-a.com"],
      "fieldWeights": { "title": 3, "body": 1 },
      "chunkMaxTokens": 512,
      "searchMode": "hybrid"
    }
  ]
}

Update src/config/tenants.ts to:
1. Load tenants.json at startup (not hardcoded)
2. Validate each tenant config on load (required fields, valid URLs)
3. Export the same getTenant() and getAllTenants() functions as before

Update provision.ts to provision all tenants defined in the JSON file
when called without a --tenant flag.

Explain:
- What the difference is between configuration and code, and why separating them matters
- What happens if tenants.json is malformed (how do we surface the error clearly)
- Why we validate on load rather than at first use
```

---

#### Prompt 9.2 — Provision & Evaluate All Tenants

```
I want to provision all tenants at once and run evaluation across all of them.

1. Update provision.ts:
   - Without --tenant flag: provision all tenants from tenants.json
   - With --tenant flag: provision that specific tenant only
   - Log a summary table at the end:
     Tenant      Index Created   Chunks Index Created   Status
     ──────────  ─────────────   ────────────────────   ──────

2. Update evaluate.ts:
   - Without --tenant flag: run evaluation across all tenants that have a qrels file
   - With --tenant flag: run for one tenant only
   - Write per-tenant results to src/evaluation/{tenantId}-results.json

3. Create a combined report at src/evaluation/all-tenants-report.json
   with NDCG@10 and MRR per tenant, per mode

Explain:
- How to handle the case where a tenant has no qrels file (skip gracefully)
- What it means when two tenants score very differently with the same search mode
```

---

## PHASE 4 — Production Hardening

### Month 10 · Observability

---

#### Prompt 10.1 — Structured Logging with Pino

```
I want consistent, structured logging throughout the application.

Install pino and pino-pretty.

In src/utils/, create a file called logger.ts that:
1. Creates a Pino logger instance
2. In development (NODE_ENV=development), uses pino-pretty for readable output
3. In production, outputs raw JSON
4. Exports a child logger factory: getLogger(context: string) => Logger
   so each module can log with its context name:
   e.g. getLogger('ingest'), getLogger('search'), getLogger('worker')

Update these files to use the logger instead of console.log:
- src/adapters/ingest.ts
- src/adapters/search.ts
- src/adapters/embeddings.ts
- src/queue/workers/ (all three workers)

Every log entry must include: timestamp, context, tenantId (where available),
durationMs (for any operation that has a start and end).

Explain:
- What structured logging is and why JSON logs are better than plain text in production
- What a child logger is and why context-scoped loggers are useful
- What log levels are (debug, info, warn, error) and when to use each
```

---

#### Prompt 10.2 — Request Tracing & Latency Metrics

```
I want to trace every search request from receipt to response.

In src/server.ts:
1. Add a Fastify onRequest hook that generates a unique requestId (use crypto.randomUUID())
   and attaches it to the request object
2. Add a Fastify onResponse hook that logs:
   { requestId, method, url, tenantId, query, searchMode, statusCode, durationMs }
3. For the /search route, also log: resultCount, topScore

In src/adapters/search.ts:
1. Wrap each OpenSearch call with a timer
2. Log: { context: "opensearch", operation: "bm25|knn|hybrid", tenantId, durationMs }

In src/utils/, create a file called metrics.ts that:
1. Tracks a rolling count of requests per route
2. Tracks p50, p95, p99 latency per route using a simple circular buffer
3. Exposes getMetrics(): object that returns the current snapshot

Add a GET /metrics route to the server that returns getMetrics() as JSON.

Explain:
- What a requestId is used for and how it helps debug issues in production
- What p50/p95/p99 means (explain with a plain example)
- Why we use a circular buffer rather than storing all latency values
```

---

#### Prompt 10.3 — Error Audit & Handling Strategy

```
I want to formalise error handling across the entire codebase.

First, create src/utils/errors.ts that defines custom error classes:
1. ConfigError       ← missing or invalid configuration
2. OpenSearchError   ← OpenSearch client errors
3. EmbeddingError    ← Ollama/embedding failures
4. ValidationError   ← document schema validation failures
5. TenantNotFoundError ← unknown tenantId

Each error class should:
- Extend the built-in Error
- Accept a message and optional context object
- Set a name property matching the class name

Then audit these files and replace any plain throw new Error() or unhandled
rejection with the appropriate typed error class:
- src/adapters/client.ts
- src/adapters/ingest.ts
- src/adapters/search.ts
- src/adapters/embeddings.ts
- src/server.ts (add a global Fastify error handler)

Create ERROR_HANDLING.md documenting:
- Which errors are recoverable vs fatal
- What the Fastify global error handler does with each error type

Explain:
- What custom error classes give us over plain Error objects
- What a global error handler in Fastify does and when it fires
- The difference between an operational error and a programmer error
```

---

### Month 11 · Performance Tuning

---

#### Prompt 11.1 — OpenSearch Profile API Integration

```
I want to understand where OpenSearch spends time executing my queries.

In src/scripts/, create a file called profileQuery.ts that:
1. Accepts --tenant, --query, and --mode flags
2. Re-runs the query with profile: true added to the query body
3. Parses the profile response and prints a readable summary:
   - For BM25: shows time spent in each query clause (ms)
   - For kNN: shows time spent in the vector search phase (ms)
4. Saves the full raw profile JSON to src/profiling/{tenant}-{timestamp}.json

Add to package.json:
  "profile": "ts-node src/scripts/profileQuery.ts"

Explain:
- What the OpenSearch Profile API returns and how to read it
- What a "query rewrite" phase is in the profile output
- What "collector" time represents
```

---

#### Prompt 11.2 — Embedding Cache

```
Re-generating embeddings for unchanged documents is wasteful.
I want to cache embeddings so re-ingestion skips documents that haven't changed.

In src/adapters/, create a file called embeddingCache.ts that:
1. Uses a JSON file at src/cache/embeddings.json as a persistent store
2. The cache key is a SHA-256 hash of the text being embedded
3. Exports:
   getCachedEmbedding(text: string): Promise<number[] | null>
   setCachedEmbedding(text: string, embedding: number[]): Promise<void>
   getCacheStats(): { entries: number; sizeBytes: number }

Update generateEmbedding() in src/adapters/embeddings.ts to:
1. Check the cache before calling Ollama
2. Store the result in the cache after a successful Ollama call
3. Log a cache hit or miss for each embedding request

Add a cache hit rate to the ingest summary log.

Explain:
- What SHA-256 hashing is and why we hash the text rather than using it directly as a key
- What the trade-off is between a file-based cache and an in-memory cache
- When this cache would give the most benefit (incremental crawl re-runs)
```

---

#### Prompt 11.3 — Benchmark Script

```
I want to measure the performance impact of all tuning changes with hard numbers.

In src/scripts/, create a file called benchmark.ts that:
1. Accepts a --tenant flag and --queries flag (path to a JSON file of test queries)
2. For each query, runs all three search modes 3 times each (to warm up)
3. Records: min, max, mean, p95 latency per mode
4. Also benchmarks:
   - Embedding generation time for a short, medium, and long text
   - Bulk indexing time for 10, 50, and 100 documents
5. Outputs a full report table to the console
6. Saves results to src/benchmarks/{timestamp}.json

Add to package.json:
  "benchmark": "ts-node src/scripts/benchmark.ts"

After running this, update PERFORMANCE.md with:
- The benchmark results table
- A written analysis of where the bottlenecks are
- What you changed and what impact it had (fill this in yourself after running)

Explain:
- Why we run each query 3 times rather than once
- What "warm-up" means in the context of a Node.js process
- What p95 tells us that mean does not
```

---

### Month 12 · Documentation & Portfolio

---

#### Prompt 12.1 — README

```
Write a complete README.md for the project root.

It must include these sections in this order:
1. Project title and one-sentence description
2. Tech stack (list with version numbers)
3. Architecture overview (text description of the main components and how they connect —
   do not generate a diagram, I will draw one myself)
4. Prerequisites (Node.js version, OpenSearch version, Ollama models required, Redis)
5. Local setup: step-by-step from git clone to first successful search query
6. Available npm scripts (table: script name, what it does)
7. Configuration: explain every field in tenants.json
8. Search modes: explain bm25, semantic, hybrid, and rag in plain language
9. Project structure: annotated file tree
10. Evaluation: how to run the evaluation harness and read the output
11. Known limitations (be honest — what this project does not handle)

Write in a tone suitable for a senior engineer reading your work for the first time.
Do not oversell it. Do not use marketing language.
```

---

#### Prompt 12.2 — ARCHITECTURE.md

```
Write ARCHITECTURE.md for the project.

It must cover these topics, each as its own section:

1. Index Strategy
   Why index-per-tenant rather than a shared index with a tenant_id filter.
   Trade-offs at scale.

2. Ingestion Pipeline
   The full flow from crawlUrl() → transformer → chunker → embedder → BullMQ → OpenSearch.
   Why each stage is separated.

3. Search Pipeline
   How a query moves from HTTP request → query builder → OpenSearch → RRF → response.
   Why hybrid is the default mode.

4. Embedding Strategy
   Why nomic-embed-text. Why 512-token chunks. Why we cache embeddings.

5. RAG Pipeline
   Retrieval → context building → generation → streaming.
   Why we retrieve chunks rather than full documents.

6. Async Job Queue
   Why BullMQ. The three-queue topology. Dead-letter handling.

7. Evaluation
   Why NDCG@10 and MRR. How to interpret the scores. What a future improvement would be.

For each section, include:
- What we decided
- What we considered and rejected
- What the limitations of the current approach are

Write in first person ("I chose X because..."). This document is part of your portfolio.
```

---

#### Prompt 12.3 — Final Retrospective Prompt (You Write This One)

```
This prompt is not for your AI assistant. Write it yourself.

Open RETROSPECTIVE.md and answer these questions honestly:

1. What was the hardest concept to understand? How did you eventually understand it?
2. What would you build differently if you started again today?
3. What does the evaluation harness tell you about the current quality of your search?
4. What is the single most important thing you learned about OpenSearch?
5. What is the single most important thing you learned about TypeScript?
6. What would Phase 2 of this project look like (next 6 months)?

Then run npm run evaluate one final time. Record the scores.
Commit everything. Tag v1.0.0.
```

---

## Appendix — Utility Prompts

These prompts can be used at any stage when you need to go deeper.

---

#### Utility A — Explain Before Proceeding

```
Before writing any code for [topic], explain the concept to me in plain language.
Cover: what it is, why it exists, and one concrete analogy.
Only write code after I confirm I understand the explanation.
```

---

#### Utility B — Code Review

```
Review the code I have written in [filename].
For each issue found, explain:
1. What the problem is
2. Why it is a problem
3. What the correct pattern is
4. A corrected version of that specific section

Do not rewrite the entire file. Point me to specific lines and patterns.
```

---

#### Utility C — TypeScript Type Audit

```
Audit [filename] for TypeScript type safety.
Flag every instance of:
- any type (explicit or implicit)
- missing return type annotations
- unchecked array access (array[0] without a null check)
- unhandled Promise rejections

For each, explain why it matters and show the corrected version.
```

---

#### Utility D — Debugging a Failing Query

```
My OpenSearch query is returning unexpected results (or an error).

Here is the query I am sending:
[paste query DSL]

Here is the response I am getting:
[paste response or error]

Here is what I expected:
[describe expected behaviour]

Walk me through how to debug this step by step, starting with the simplest possible check.
```

---

#### Utility E — Performance Regression Check

```
After my last change, search latency increased noticeably.

Before the change: [describe what you changed]
Latency before: [number]ms
Latency after:  [number]ms

Walk me through how to identify the cause, starting with the OpenSearch Profile API.
Do not suggest solutions yet — help me find the root cause first.
```

---

*Last updated: Month 1, Day 1. Update this file as your understanding evolves.*