import { client } from "./client.js";
import type { Tenant } from "../types/domains.js";

export async function indexExists(tenant: Tenant): Promise<boolean> {
  const response = await client.indices.exists({ index: tenant.indexName });
  return response.statusCode === 200;
}

export async function createTenantIndex(tenant: Tenant): Promise<void> {
  if (await indexExists(tenant)) {
    console.log(`[IndexManager] Index "${tenant.indexName}" already exists — skipping creation.`);
    return;
  }

  await client.indices.create({
    index: tenant.indexName,
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

  console.log(`[IndexManager] Index "${tenant.indexName}" created.`);
}

export async function deleteTenantIndex(tenant: Tenant): Promise<void> {
  if (!(await indexExists(tenant))) {
    console.log(`[IndexManager] Index "${tenant.indexName}" does not exist — nothing to delete.`);
    return;
  }
  await client.indices.delete({ index: tenant.indexName });
  console.log(`[IndexManager] Index "${tenant.indexName}" deleted.`);
}

export async function listTenantIndices(): Promise<string[]> {
  const response = await client.cat.indices({ index: 'tenant_*_documents', format: 'json' });
  const rows = response.body as Array<{ index: string }>;
  return rows.map((r) => r.index).sort();
}
