import 'dotenv/config';
import { createTenantIndex, deleteTenantIndex } from '../adapters/index-manager.js';
import { bulkIndexDocuments } from '../adapters/ingest.js';
import { keywordSearch } from '../adapters/keyword-search.js';
import { client } from '../adapters/client.js';
import type { Tenant, Document, SearchResult } from '../types/domains.js';

// ---------------------------------------------------------------------------
// Test tenants — isolated from production indices by using unique index names.
// ---------------------------------------------------------------------------

const TENANT_A: Tenant = {
  id: 'test_isolation_a',
  name: 'Test Tenant A',
  sourceUrl: 'https://test-a.example.com',
  indexName: 'test_isolation_tenant_a',
};

const TENANT_B: Tenant = {
  id: 'test_isolation_b',
  name: 'Test Tenant B',
  sourceUrl: 'https://test-b.example.com',
  indexName: 'test_isolation_tenant_b',
};

// ---------------------------------------------------------------------------
// Fixture documents — each tenant has a unique term that does not appear in
// the other tenant's documents. This makes cross-contamination unambiguous.
// ---------------------------------------------------------------------------

const DOCS_A: Document[] = [
  {
    title: 'Xanthium Overview',
    body: 'Xanthium is a genus of flowering plants in the daisy family.',
    url: 'https://test-a.example.com/1',
    created_at: '2024-01-01T00:00:00Z',
    tenant_id: 'test_isolation_a',
  },
  {
    title: 'Xanthium Research',
    body: 'Recent xanthium studies highlight its medicinal properties.',
    url: 'https://test-a.example.com/2',
    created_at: '2024-01-02T00:00:00Z',
    tenant_id: 'test_isolation_a',
  },
  {
    title: 'Growing Xanthium',
    body: 'Farmers cultivate xanthium for commercial purposes.',
    url: 'https://test-a.example.com/3',
    created_at: '2024-01-03T00:00:00Z',
    tenant_id: 'test_isolation_a',
  },
];

const DOCS_B: Document[] = [
  {
    title: 'Zymurgy Basics',
    body: 'Zymurgy is the science and practice of fermentation.',
    url: 'https://test-b.example.com/1',
    created_at: '2024-01-01T00:00:00Z',
    tenant_id: 'test_isolation_b',
  },
  {
    title: 'Advanced Zymurgy',
    body: 'Advanced zymurgy techniques improve yield and flavour.',
    url: 'https://test-b.example.com/2',
    created_at: '2024-01-02T00:00:00Z',
    tenant_id: 'test_isolation_b',
  },
  {
    title: 'Zymurgy History',
    body: 'The history of zymurgy traces back thousands of years.',
    url: 'https://test-b.example.com/3',
    created_at: '2024-01-03T00:00:00Z',
    tenant_id: 'test_isolation_b',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function refreshIndices(...tenants: Tenant[]): Promise<void> {
  await Promise.all(
    tenants.map((t) => client.indices.refresh({ index: t.indexName })),
  );
}

async function cleanup(...tenants: Tenant[]): Promise<void> {
  await Promise.all(tenants.map((t) => deleteTenantIndex(t)));
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

async function runTest(
  name: string,
  fn: () => Promise<void>,
): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true, detail: 'OK' };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { name, passed: false, detail };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Tenant Isolation Test ===\n');

  // Ensure clean state before provisioning.
  await cleanup(TENANT_A, TENANT_B);

  // 1. Provision both indices.
  await createTenantIndex(TENANT_A);
  await createTenantIndex(TENANT_B);

  // 2. Ingest documents.
  await bulkIndexDocuments(TENANT_A, DOCS_A);
  await bulkIndexDocuments(TENANT_B, DOCS_B);

  // Force a refresh so newly indexed documents are immediately searchable.
  await refreshIndices(TENANT_A, TENANT_B);

  const results: TestResult[] = [];

  // 3-4. Search in Tenant A — results must contain only Tenant A documents.
  results.push(
    await runTest(
      'Tenant A: "xanthium" returns only Tenant A documents',
      async () => {
        const hits: SearchResult[] = await keywordSearch(TENANT_A, 'xanthium');
        assert(hits.length > 0, `Expected results for "xanthium" in Tenant A, got 0`);
        for (const hit of hits) {
          assert(
            hit.url.startsWith('https://test-a.example.com'),
            `Result URL "${hit.url}" does not belong to Tenant A`,
          );
        }
      },
    ),
  );

  // 5-6. Search in Tenant B — results must contain only Tenant B documents.
  results.push(
    await runTest(
      'Tenant B: "zymurgy" returns only Tenant B documents',
      async () => {
        const hits: SearchResult[] = await keywordSearch(TENANT_B, 'zymurgy');
        assert(hits.length > 0, `Expected results for "zymurgy" in Tenant B, got 0`);
        for (const hit of hits) {
          assert(
            hit.url.startsWith('https://test-b.example.com'),
            `Result URL "${hit.url}" does not belong to Tenant B`,
          );
        }
      },
    ),
  );

  // Cross-contamination checks — searching Tenant A's term against Tenant B
  // and vice versa should return no results.
  results.push(
    await runTest(
      'Tenant B index: searching "xanthium" (Tenant A term) returns no results',
      async () => {
        const hits: SearchResult[] = await keywordSearch(TENANT_B, 'xanthium');
        assert(
          hits.length === 0,
          `Expected 0 results for "xanthium" in Tenant B, got ${hits.length}`,
        );
      },
    ),
  );

  results.push(
    await runTest(
      'Tenant A index: searching "zymurgy" (Tenant B term) returns no results',
      async () => {
        const hits: SearchResult[] = await keywordSearch(TENANT_A, 'zymurgy');
        assert(
          hits.length === 0,
          `Expected 0 results for "zymurgy" in Tenant A, got ${hits.length}`,
        );
      },
    ),
  );

  // 7. Report results.
  console.log('\n--- Results ---');
  let allPassed = true;
  for (const r of results) {
    const label = r.passed ? 'PASS' : 'FAIL';
    console.log(`[${label}] ${r.name}`);
    if (!r.passed) {
      console.log(`       ${r.detail}`);
      allPassed = false;
    }
  }

  console.log(`\n${allPassed ? 'PASS — all tests passed.' : 'FAIL — one or more tests failed.'}`);

  // Tear down test indices regardless of outcome.
  await cleanup(TENANT_A, TENANT_B);

  if (!allPassed) process.exit(1);
}

main().catch((err) => {
  console.error('[testIsolation] Unexpected error:', err);
  process.exit(1);
});
