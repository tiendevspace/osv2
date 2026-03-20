import type { Document, RawPage } from "../types/domains.js";

const BODY_MAX_LENGTH = 10_000;

export function validateDocument(doc: Document): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (doc.title.trim() === '') {
    errors.push('title must not be empty');
  } else if (doc.title.length > 500) {
    errors.push('title must be under 500 characters');
  }

  try {
    new URL(doc.url);
  } catch {
    errors.push(`url is not a valid URL: "${doc.url}"`);
  }

  if (doc.tenant_id.trim() === '') {
    errors.push('tenant_id must not be empty');
  }

  if (isNaN(Date.parse(doc.created_at))) {
    errors.push(`created_at is not a parseable date: "${doc.created_at}"`);
  }

  return { valid: errors.length === 0, errors };
}

function normaliseBody(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')   // collapse all newline sequences to a single space
    .replace(/[ \t]{2,}/g, ' ') // collapse runs of spaces/tabs to one space
    .trim();
}

export function transformPage(raw: RawPage, tenantId: string): Document {
  return {
    title: raw.title,
    body: normaliseBody(raw.body).slice(0, BODY_MAX_LENGTH),
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
