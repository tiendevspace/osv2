import type { Document, RawPage } from "../types/domains.js";

const BODY_MAX_LENGTH = 10_000;

export function transformPage(raw: RawPage, tenantId: string): Document {
  return {
    title: raw.title,
    body: raw.body.slice(0, BODY_MAX_LENGTH),
    url: raw.url,
    created_at: raw.crawled_at,
    tenant_id: tenantId,
    ...(raw.metadata !== undefined && { metadata: raw.metadata }),
  };
}

export function transformPages(raws: RawPage[], tenantId: string): Document[] {
  return raws
    .filter((raw) => raw.title.trim() !== "" && raw.body.trim() !== "")
    .map((raw) => transformPage(raw, tenantId));
}
