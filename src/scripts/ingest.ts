import 'dotenv/config';
import { crawlUrl } from '../services/crawler.js';
import { transformPages } from '../adapters/transformer.js';
import { bulkIndexDocuments } from '../adapters/ingest.js';

// --- CLI argument parsing ---
// process.argv is an array: ['node', 'script.ts', '--tenant=demo', '--url=https://...']
// We skip the first two entries (runtime + script path) and parse the rest.
function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.+)$/);
    if (match?.[1] !== undefined && match?.[2] !== undefined) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const tenant = args['tenant'];
const url = args['url'];

if (!tenant || !url) {
  console.error('Usage: npm run ingest -- --tenant=<id> --url=<url>');
  process.exit(1);
}

// --- Pipeline ---
const summary = {
  tenant,
  url,
  pagesCrawled: 0,
  documentsIndexed: 0,
  errors: [] as string[],
};

// Stage 1: crawl
let rawPages;
try {
  rawPages = await crawlUrl(url);
  summary.pagesCrawled = rawPages.length;
} catch (err) {
  summary.errors.push(`Crawl failed: ${err instanceof Error ? err.message : String(err)}`);
  printSummary(summary);
  process.exit(1);
}

// Stage 2: transform (filter + reshape)
// Pages with no title or body are silently dropped here; that is intentional —
// they carry no searchable content.
const documents = transformPages(rawPages, tenant);

// Stage 3: bulk index
try {
  await bulkIndexDocuments(tenant, documents);
  summary.documentsIndexed = documents.length;
} catch (err) {
  summary.errors.push(`Bulk index failed: ${err instanceof Error ? err.message : String(err)}`);
}

printSummary(summary);
if (summary.errors.length > 0) process.exit(1);

// --- Summary ---
// We log a single summary rather than per-document logs because at scale
// (hundreds or thousands of pages) individual logs would be unreadable and
// would swamp any log aggregator. A summary gives operators the signal they
// need — did it work, how many, any errors — without the noise.
function printSummary(s: typeof summary): void {
  console.log('\n--- Ingest summary ---');
  console.log(`Tenant:              ${s.tenant}`);
  console.log(`URL:                 ${s.url}`);
  console.log(`Pages crawled:       ${s.pagesCrawled}`);
  console.log(`Documents indexed:   ${s.documentsIndexed}`);
  console.log(`Errors:              ${s.errors.length === 0 ? 'none' : s.errors.length}`);
  for (const e of s.errors) console.error(`  • ${e}`);
  console.log('----------------------\n');
}
