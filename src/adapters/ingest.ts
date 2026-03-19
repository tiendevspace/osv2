import { createHash } from "crypto";
import { client } from "./client.js";
import type { Document } from "../types/domains.js";

function indexName(tenantId: string): string {
  return `tenant_${tenantId}_documents`;
}

// Derive a stable, URL-safe document ID from the document's URL.
// SHA-1 gives a 40-char hex string; we take the first 16 characters,
// which is ample for uniqueness across a typical document corpus.
function docIdFromUrl(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

export async function indexDocument(tenantId: string, doc: Document): Promise<void> {
  const id = docIdFromUrl(doc.url);
  await client.index({
    index: indexName(tenantId),
    id,
    body: doc,
  });
}

export async function deleteDocument(tenantId: string, url: string): Promise<void> {
  const id = docIdFromUrl(url);
  await client.delete({
    index: indexName(tenantId),
    id
  });
}

export async function bulkIndexDocuments(tenantId: string, docs: Document[]): Promise<void> {
  if (docs.length === 0) return;

  const index = indexName(tenantId);

  // The bulk API expects alternating action/source lines.
  // Each document needs one { index: { _index, _id } } header followed by the document body.
  const operations = docs.flatMap((doc) => [
    { index: { _index: index, _id: docIdFromUrl(doc.url) } },
    doc,
  ]);

  const response = await client.bulk({ body: operations });
  const body = response.body as {
    errors: boolean;
    items: Array<{ index?: { status: number; error?: { reason: string } } }>;
  };

  if (!body.errors) {
    console.log(`[Ingest] Bulk indexed ${docs.length}/${docs.length} documents into "${index}".`);
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

  console.log(`[Ingest] Bulk index complete — succeeded: ${succeeded}, failed: ${failed}.`);
}
