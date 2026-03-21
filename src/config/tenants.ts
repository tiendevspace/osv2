import type { Tenant } from '../types/domains.js';

const TENANTS: Tenant[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    sourceUrl: 'https://www.anthropic.com',
    indexName: 'tenant_anthropic_documents',
  },
  {
    id: 'opensearch',
    name: 'OpenSearch',
    sourceUrl: 'https://opensearch.org/docs/latest',
    indexName: 'tenant_opensearch_documents',
    fieldWeights: {
      title: 3,
      body: 1,
    },
  },
  {
    id: 'acme_corp',
    name: 'Acme Corp',
    sourceUrl: 'https://www.acme.com',
    indexName: 'ecommerce'
  }
];

export function getAllTenants(): Tenant[] {
  return TENANTS;
}

export function getTenant(tenantId: string): Tenant | undefined {
  return TENANTS.find((t) => t.id === tenantId);
}
