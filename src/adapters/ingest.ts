import { createHash } from "crypto";
import { client } from "./client.js";
import type { Document, Tenant } from "../types/domains.js";
import { validateDocument } from "./transformer.js";

// Derive a stable, URL-safe document ID from the document's URL.
// SHA-1 gives a 40-char hex string; we take the first 16 characters,
// which is ample for uniqueness across a typical document corpus.
function docIdFromUrl(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

export async function indexDocument(tenant: Tenant, doc: Document): Promise<void> {
  const id = docIdFromUrl(doc.url);
  await client.index({
    index: tenant.indexName,
    id,
    body: doc,
  });
}

export async function deleteDocument(tenant: Tenant, url: string): Promise<void> {
  const id = docIdFromUrl(url);
  await client.delete({
    index: tenant.indexName,
    id
  });
}

export async function bulkIndexDocuments(tenant: Tenant, docs: Document[]): Promise<void> {
  if (docs.length === 0) return;

  // Validate each document before sending to OpenSearch.
  // Invalid documents are logged and skipped rather than letting OpenSearch reject them.
  let invalidCount = 0;
  const validDocs = docs.filter((doc) => {
    const { valid, errors } = validateDocument(doc);
    if (!valid) {
      invalidCount++;
      console.warn(`[Ingest] Skipping invalid document "${doc.url}": ${errors.join('; ')}`);
    }
    return valid;
  });

  if (validDocs.length === 0) {
    console.warn(`[Ingest] All ${docs.length} documents failed validation — nothing to index.`);
    return;
  }

  // The bulk API expects alternating action/source lines.
  // Each document needs one { index: { _index, _id } } header followed by the document body.
  const operations = validDocs.flatMap((doc) => [
    { index: { _index: tenant.indexName, _id: docIdFromUrl(doc.url) } },
    doc,
  ]);

  const response = await client.bulk({ body: operations });
  const body = response.body as {
    errors: boolean;
    items: Array<{ index?: { status: number; error?: { reason: string } } }>;
  };

  if (!body.errors) {
    console.log(`[Ingest] Bulk indexed ${validDocs.length}/${docs.length} documents into "${tenant.indexName}" (${invalidCount} skipped as invalid).`);
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const item of body.items) {
    const status = item.index?.status ?? 0;
    if (status >= 200 && status < 300) {
      succeeded++;
    } else {
      failed++;
      const reason = item.index?.error?.reason ?? "unknown error";
      console.error(`[Ingest] Document failed: ${reason}`);
    }
  }

  console.log(`[Ingest] Bulk index complete — succeeded: ${succeeded}, failed: ${failed}, skipped (invalid): ${invalidCount}.`);
}
