import 'dotenv/config';
import readline from 'node:readline';
import { crawlUrl } from '../services/crawler.js';
import { transformPages } from '../adapters/transformer.js';
import { bulkIndexDocuments } from '../adapters/ingest.js';
import { createTenantIndex, deleteTenantIndex, listTenantIndices } from '../adapters/index-manager.js';
import { keywordSearch } from '../adapters/keyword-search.js';
import { phraseSearch } from '../adapters/phrase-search.js';
import { prefixSearch } from '../adapters/prefix-search.js';
import { wildcardSearch } from '../adapters/wildcard-search.js';
import { fuzzySearch } from '../adapters/fuzzy-search.js';
import { queryStringSearch } from '../adapters/query-string-search.js';
import { getAllTenants, getTenant } from '../config/tenants.js';
import { provisionTenant, toTenantId } from './provision.js';
import type { SearchResult, Tenant } from '../types/domains.js';

// ---------------------------------------------------------------------------
// Terminal helpers
// ---------------------------------------------------------------------------

const RESET   = '\x1b[0m';
const BOLD    = '\x1b[1m';
const DIM     = '\x1b[2m';
const CYAN    = '\x1b[36m';
const GREEN   = '\x1b[32m';
const YELLOW  = '\x1b[33m';
const RED     = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const WHITE   = '\x1b[37m';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

async function askRequired(question: string): Promise<string> {
  let value = '';
  while (!value) {
    value = await ask(question);
    if (!value) print(`${RED}  This field is required.${RESET}`);
  }
  return value;
}

function print(msg: string): void { console.log(msg); }
function blank(): void { console.log(); }

function banner(): void {
  console.clear();
  print(`${CYAN}${BOLD}┌─────────────────────────────────────────┐${RESET}`);
  print(`${CYAN}${BOLD}│           OpenSearch CLI                │${RESET}`);
  print(`${CYAN}${BOLD}│      made in melbourne with love        │${RESET}`);
  print(`${CYAN}${BOLD}└─────────────────────────────────────────┘${RESET}`);
  blank();
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function printResults(results: SearchResult[]): void {
  blank();
  if (results.length === 0) {
    print(`  ${DIM}No results found.${RESET}`);
    return;
  }
  print(`  ${GREEN}${results.length} result(s):${RESET}`);
  blank();
  for (const r of results) {
    print(`  ${WHITE}[${r.score.toFixed(3)}]${RESET} ${BOLD}${r.title}${RESET}`);
    print(`  ${DIM}        ${r.url}${RESET}`);
    if (r.metadata?.description) {
      print(`  ${DIM}        ${r.metadata.description}${RESET}`);
    }
    blank();
  }
}

function printIngestSummary(s: {
  tenant: string;
  url: string;
  pagesCrawled: number;
  documentsIndexed: number;
  errors: string[];
}): void {
  blank();
  print(`  ${BOLD}Ingest summary${RESET}`);
  print(`  ${DIM}──────────────────────${RESET}`);
  print(`  Tenant:            ${CYAN}${s.tenant}${RESET}`);
  print(`  URL:               ${DIM}${s.url}${RESET}`);
  print(`  Pages crawled:     ${WHITE}${s.pagesCrawled}${RESET}`);
  print(`  Documents indexed: ${WHITE}${s.documentsIndexed}${RESET}`);
  if (s.errors.length === 0) {
    print(`  Errors:            ${GREEN}none${RESET}`);
  } else {
    print(`  Errors:            ${RED}${s.errors.length}${RESET}`);
    for (const e of s.errors) print(`  ${RED}  • ${e}${RESET}`);
  }
}

// ---------------------------------------------------------------------------
// Tenant picker
// ---------------------------------------------------------------------------

async function askTenant(): Promise<Tenant> {
  const tenants = getAllTenants();
  blank();
  print(`  ${MAGENTA}${BOLD}Configured tenants${RESET}`);
  for (const t of tenants) {
    print(`  ${WHITE}•${RESET} ${t.id}  ${DIM}${t.name}${RESET}`);
  }
  blank();
  while (true) {
    const id = await ask(`${YELLOW}Tenant ID${RESET}: `);
    const tenant = getTenant(id);
    if (tenant) return tenant;
    print(`${RED}  Unknown tenant: "${id}"${RESET}`);
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function actionIngest(): Promise<void> {
  blank();
  const tenant = await askTenant();
  const url = tenant.sourceUrl;

  const summary = { tenant: tenant.id, url, pagesCrawled: 0, documentsIndexed: 0, errors: [] as string[] };

  blank();
  print(`  ${DIM}Crawling…${RESET}`);
  let rawPages;
  try {
    rawPages = await crawlUrl(url);
    summary.pagesCrawled = rawPages.length;
  } catch (err) {
    summary.errors.push(`Crawl failed: ${err instanceof Error ? err.message : String(err)}`);
    printIngestSummary(summary);
    return;
  }

  // Pages with no title or body are silently dropped — they carry no searchable content.
  const documents = transformPages(rawPages, tenant.id);

  print(`  ${DIM}Indexing…${RESET}`);
  try {
    await bulkIndexDocuments(tenant, documents);
    summary.documentsIndexed = documents.length;
  } catch (err) {
    summary.errors.push(`Bulk index failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  printIngestSummary(summary);
}

async function actionReindex(): Promise<void> {
  blank();
  const tenant = await askTenant();
  const url = tenant.sourceUrl;

  const summary = { tenant: tenant.id, url, pagesCrawled: 0, documentsIndexed: 0, errors: [] as string[] };

  blank();
  print(`  ${DIM}Deleting existing index…${RESET}`);
  try {
    await deleteTenantIndex(tenant);
  } catch (err) {
    summary.errors.push(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    printIngestSummary(summary);
    return;
  }

  print(`  ${DIM}Recreating index…${RESET}`);
  try {
    await createTenantIndex(tenant);
  } catch (err) {
    summary.errors.push(`Index creation failed: ${err instanceof Error ? err.message : String(err)}`);
    printIngestSummary(summary);
    return;
  }

  print(`  ${DIM}Crawling…${RESET}`);
  let rawPages;
  try {
    rawPages = await crawlUrl(url);
    summary.pagesCrawled = rawPages.length;
  } catch (err) {
    summary.errors.push(`Crawl failed: ${err instanceof Error ? err.message : String(err)}`);
    printIngestSummary(summary);
    return;
  }

  const documents = transformPages(rawPages, tenant.id);

  print(`  ${DIM}Indexing…${RESET}`);
  try {
    await bulkIndexDocuments(tenant, documents);
    summary.documentsIndexed = documents.length;
  } catch (err) {
    summary.errors.push(`Bulk index failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  printIngestSummary(summary);
}

async function actionKeywordSearch(): Promise<void> {
  const tenant = await askTenant();
  const term   = await askRequired(`${YELLOW}Search term${RESET}: `);
  printResults(await keywordSearch(tenant, term));
}

async function actionPhraseSearch(): Promise<void> {
  const tenant = await askTenant();
  const field  = await askRequired(`${YELLOW}Field${RESET} ${DIM}(e.g. title, body)${RESET}: `);
  const phrase = await askRequired(`${YELLOW}Phrase${RESET}: `);
  printResults(await phraseSearch(tenant, field, phrase));
}

async function actionPrefixSearch(): Promise<void> {
  const tenant = await askTenant();
  const field  = await askRequired(`${YELLOW}Field${RESET} ${DIM}(e.g. title, body)${RESET}: `);
  const prefix = await askRequired(`${YELLOW}Prefix${RESET}: `);
  printResults(await prefixSearch(tenant, field, prefix));
}

async function actionWildcardSearch(): Promise<void> {
  const tenant  = await askTenant();
  const field   = await askRequired(`${YELLOW}Field${RESET} ${DIM}(e.g. title, body)${RESET}: `);
  const pattern = await askRequired(`${YELLOW}Pattern${RESET} ${DIM}(e.g. open*)${RESET}: `);
  printResults(await wildcardSearch(tenant, field, pattern));
}

async function actionFuzzySearch(): Promise<void> {
  const tenant    = await askTenant();
  const field     = await askRequired(`${YELLOW}Field${RESET} ${DIM}(e.g. title, body)${RESET}: `);
  const term      = await askRequired(`${YELLOW}Term${RESET}: `);
  const fuzziness = await ask(`${YELLOW}Fuzziness${RESET} ${DIM}[AUTO]${RESET}: `);
  printResults(await fuzzySearch(tenant, field, term, fuzziness || undefined));
}

async function actionQueryStringSearch(): Promise<void> {
  const tenant    = await askTenant();
  const query     = await askRequired(`${YELLOW}Query${RESET} ${DIM}(e.g. title:search AND open)${RESET}: `);
  const rawFields = await ask(`${YELLOW}Fields, comma-separated${RESET} ${DIM}[title,body]${RESET}: `);
  const fields    = rawFields ? rawFields.split(',').map((f) => f.trim()) : ['title', 'body'];
  printResults(await queryStringSearch(tenant, query, fields));
}

async function actionProvision(): Promise<void> {
  blank();
  let displayName = '';
  while (!displayName) {
    displayName = await ask(`${YELLOW}Tenant display name${RESET} ${DIM}(e.g. "Melton City Council")${RESET}: `);
    if (!displayName) print(`${RED}  This field is required.${RESET}`);
  }

  const tenantId = toTenantId(displayName);
  print(`${DIM}  → Derived ID: ${tenantId}${RESET}`);
  blank();

  await provisionTenant(tenantId, { ask, print, blank });
}

async function actionIndexCreate(): Promise<void> {
  blank();
  const tenant = await askTenant();
  await createTenantIndex(tenant);
}

async function actionIndexList(): Promise<void> {
  const indices = await listTenantIndices();
  blank();
  if (indices.length === 0) {
    print(`  ${DIM}No tenant indices found.${RESET}`);
  } else {
    print(`  ${GREEN}${indices.length} index(es):${RESET}`);
    blank();
    for (const idx of indices) print(`  ${WHITE}•${RESET} ${idx}`);
  }
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

interface MenuItem {
  key: string;
  label: string;
  section?: string;
  action: () => Promise<void>;
}

const INGEST_MENU: MenuItem[] = [
  { key: '1', label: 'Ingest pages',  action: actionIngest },
  { key: '2', label: 'Re-index',      action: actionReindex },
];

const SEARCH_MENU: MenuItem[] = [
  { key: '1', label: 'Keyword search',      action: actionKeywordSearch },
  { key: '2', label: 'Phrase search',       action: actionPhraseSearch },
  { key: '3', label: 'Prefix search',       action: actionPrefixSearch },
  { key: '4', label: 'Wildcard search',     action: actionWildcardSearch },
  { key: '5', label: 'Fuzzy search',        action: actionFuzzySearch },
  { key: '6', label: 'Query string search', action: actionQueryStringSearch },
];

const MAIN_MENU: MenuItem[] = [
  { key: '1', label: 'Ingest',        section: 'Ingest', action: actionIngestMenu },
  { key: '2', label: 'Search',        section: 'Search', action: actionSearchMenu },
  { key: '3', label: 'Provision',     section: 'Index',  action: actionProvision },
  { key: '4', label: 'Create index',  section: 'Index',  action: actionIndexCreate },
  { key: '5', label: 'List indices',  section: 'Index',  action: actionIndexList },
];

function printMenuItems(items: MenuItem[]): void {
  let currentSection = '';
  for (const item of items) {
    if (item.section && item.section !== currentSection) {
      currentSection = item.section;
      blank();
      print(`  ${MAGENTA}${BOLD}${currentSection}${RESET}`);
    }
    print(`  ${CYAN}${item.key}${RESET}  ${item.label}`);
  }
}

async function runMenu(items: MenuItem[], exitLabel: string): Promise<void> {
  while (true) {
    blank();
    printMenuItems(items);
    blank();
    print(`  ${DIM}q   ${exitLabel}${RESET}`);
    blank();
    const choice = await ask(`${BOLD}> ${RESET}`);

    if (choice === 'q') return;

    const item = items.find((m) => m.key === choice);
    if (!item) {
      print(`${RED}  Unknown option: "${choice}"${RESET}`);
      continue;
    }

    try {
      await item.action();
    } catch (err) {
      print(`${RED}  Error: ${err instanceof Error ? err.message : String(err)}${RESET}`);
    }

    blank();
    await ask(`${DIM}Press Enter to continue…${RESET}`);
    banner();
  }
}

async function actionIngestMenu(): Promise<void> {
  await runMenu(INGEST_MENU, 'Back');
}

async function actionSearchMenu(): Promise<void> {
  await runMenu(SEARCH_MENU, 'Back');
}

async function main(): Promise<void> {
  banner();

  while (true) {
    printMenuItems(MAIN_MENU);
    blank();
    print(`  ${DIM}q   Exit${RESET}`);
    blank();
    const choice = await ask(`${BOLD}> ${RESET}`);

    if (choice === 'q' || choice === 'quit' || choice === 'exit') {
      blank();
      print(`${GREEN}Goodbye.${RESET}`);
      rl.close();
      process.exit(0);
    }

    const item = MAIN_MENU.find((m) => m.key === choice);
    if (!item) {
      print(`${RED}  Unknown option: "${choice}"${RESET}`);
    } else {
      try {
        await item.action();
      } catch (err) {
        print(`${RED}  Error: ${err instanceof Error ? err.message : String(err)}${RESET}`);
      }
    }

    if (choice !== '1' && choice !== '2') {
      // Sub-menus (Ingest, Search) manage their own banner/continue cycle; skip for everything else
      blank();
      await ask(`${DIM}Press Enter to continue…${RESET}`);
    }
    banner();
  }
}

main().catch((err) => {
  console.error('CLI crashed:', err);
  process.exit(1);
});
