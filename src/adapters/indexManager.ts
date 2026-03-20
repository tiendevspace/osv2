import { client } from "./client.js";

function indexName(tenantId: string): string {
  return `tenant_${tenantId}_documents`;
}

export async function indexExists(tenantId: string): Promise<boolean> {
  const response = await client.indices.exists({ index: indexName(tenantId) });
  return response.statusCode === 200;
}

export async function createTenantIndex(tenantId: string): Promise<void> {
  const index = indexName(tenantId);

  if (await indexExists(tenantId)) {
    console.log(`[IndexManager] Index "${index}" already exists — skipping creation.`);
    return;
  }

  await client.indices.create({
    index,
    body: {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
      },
      mappings: {
        properties: {
          title:      { type: "text" },
          body:       { type: "text" },
          url:        { type: "keyword" },
          created_at: { type: "date" },
          tenant_id:  { type: "keyword" },
          metadata: {
            properties: {
              description:   { type: "text" },
              lang:          { type: "keyword" },
              canonical_url: { type: "keyword" },
              author:        { type: "keyword" },
              published_at:  { type: "date" },
              modified_at:   { type: "date" },
              og_image:      { type: "keyword", index: false },
              og_type:       { type: "keyword" },
              keywords:      { type: "text" },
              headings:      { type: "text" },
            },
          },
        },
      },
    },
  });

  console.log(`[IndexManager] Index "${index}" created.`);
}

export async function deleteTenantIndex(tenantId: string): Promise<void> {
  const index = indexName(tenantId);
  if (!(await indexExists(tenantId))) {
    console.log(`[IndexManager] Index "${index}" does not exist — nothing to delete.`);
    return;
  }
  await client.indices.delete({ index });
  console.log(`[IndexManager] Index "${index}" deleted.`);
}

export async function listTenantIndices(): Promise<string[]> {
  const response = await client.cat.indices({ index: 'tenant_*_documents', format: 'json' });
  const rows = response.body as Array<{ index: string }>;
  return rows.map((r) => r.index).sort();
}

export async function listTenantIds(): Promise<string[]> {
  const indices = await listTenantIndices();
  return indices.map((idx) => idx.replace(/^tenant_/, '').replace(/_documents$/, ''));
}
