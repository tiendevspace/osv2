import 'dotenv/config';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { getTenant } from '../config/tenants.js';
import { indexExists, createTenantIndex, deleteTenantIndex } from '../adapters/index-manager.js';

// ---------------------------------------------------------------------------
// Terminal helpers (standalone mode only)
// ---------------------------------------------------------------------------

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const CYAN   = '\x1b[36m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const WHITE  = '\x1b[37m';

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

/**
 * Converts a free-text display name to a lowercase snake_case tenant ID.
 * "Melton City Council" → "melton_city_council"
 */
export function toTenantId(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ---------------------------------------------------------------------------
// Core provision logic — accepts injected I/O so it can run inside the
// interactive CLI (which owns its own readline) or standalone.
// ---------------------------------------------------------------------------

interface Io {
  ask:   (question: string) => Promise<string>;
  print: (msg: string) => void;
  blank: () => void;
}

export async function provisionTenant(tenantId: string, io: Io): Promise<void> {
  const { ask, print, blank } = io;

  const tenant = getTenant(tenantId);
  if (!tenant) {
    print(`${RED}  Tenant "${tenantId}" not found in src/config/tenants.ts.${RESET}`);
    print(`${DIM}  Add an entry with id: '${tenantId}' there, then re-run provision.${RESET}`);
    return;
  }

  const exists = await indexExists(tenant);

  if (exists) {
    blank();
    print(`${YELLOW}  Warning: index "${tenant.indexName}" already exists.${RESET}`);
    const answer = await ask(`${YELLOW}  Overwrite? All existing documents will be deleted. [y/N]${RESET}: `);
    if (answer.toLowerCase() !== 'y') {
      print(`${DIM}  Aborted — index left unchanged.${RESET}`);
      return;
    }
    blank();
    print(`  ${DIM}Deleting existing index…${RESET}`);
    await deleteTenantIndex(tenant);
  }

  print(`  ${DIM}Creating index "${tenant.indexName}"…${RESET}`);
  await createTenantIndex(tenant);

  blank();
  print(`  ${BOLD}Tenant configuration applied${RESET}`);
  print(`  ${DIM}──────────────────────────────${RESET}`);
  print(`  ID:         ${CYAN}${tenant.id}${RESET}`);
  print(`  Name:       ${WHITE}${tenant.name}${RESET}`);
  print(`  Index:      ${WHITE}${tenant.indexName}${RESET}`);
  print(`  Source URL: ${DIM}${tenant.sourceUrl}${RESET}`);

  if (tenant.fieldWeights) {
    print(`  Field weights:`);
    if (tenant.fieldWeights.title !== undefined) {
      print(`    title:  ${WHITE}${tenant.fieldWeights.title}${RESET}`);
    }
    if (tenant.fieldWeights.body !== undefined) {
      print(`    body:   ${WHITE}${tenant.fieldWeights.body}${RESET}`);
    }
  } else {
    print(`  Field weights: ${DIM}default${RESET}`);
  }

  blank();
  print(`  ${GREEN}Index provisioned successfully.${RESET}`);
}

// ---------------------------------------------------------------------------
// Standalone entrypoint — only runs when executed directly, not when imported
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask   = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
  const print = (msg: string): void => { console.log(msg); };
  const blank = (): void => { console.log(); };

  blank();
  print(`${CYAN}${BOLD}Tenant Provisioning${RESET}`);
  blank();

  let displayName = '';
  while (!displayName) {
    displayName = await ask(`${YELLOW}Tenant display name${RESET} ${DIM}(e.g. "Melton City Council")${RESET}: `);
    if (!displayName) print(`${RED}  This field is required.${RESET}`);
  }

  const tenantId = toTenantId(displayName);
  print(`${DIM}  → Derived ID: ${tenantId}${RESET}`);

  await provisionTenant(tenantId, { ask, print, blank });

  rl.close();
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error('Provision failed:', err);
    process.exit(1);
  });
}
