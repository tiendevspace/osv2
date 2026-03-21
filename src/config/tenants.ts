import type { Tenant } from '../types/domains.js';

const TENANTS: Tenant[] = [
  {
    id: 'acme_corp',
    name: 'Acme Corp',
    sourceUrl: 'https://www.acme.com',
    indexName: 'acme_corp_main',
    fieldWeights: {}
  }
];

export function getAllTenants(): Tenant[] {
  return TENANTS;
}

export function getTenant(tenantId: string): Tenant | undefined {
  return TENANTS.find((t) => t.id === tenantId);
}
