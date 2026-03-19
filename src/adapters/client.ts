import { Client } from "@opensearch-project/opensearch";
import type { ClusterHealthResponse, OpenSearchClient } from "../types/opensearch.js";

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {

  // process is a global object built into Node.js — it's not imported or defined anywhere, it's just always available.
  // process.env is a property on that object that holds all environment variables as key-value strings (loaded from the shell environment, or via a .env loader like dotenv).
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env and provide a value.`
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Client singleton
// Constructed once at module load time. requireEnv throws immediately if any
// variable is absent, so misconfiguration surfaces at startup, not mid-request.
// ---------------------------------------------------------------------------

export const client: OpenSearchClient = new Client({
  node: requireEnv("OPENSEARCH_URL"),
  auth: {
    username: requireEnv("OPENSEARCH_USERNAME"),
    password: requireEnv("OPENSEARCH_PASSWORD"),
  },
  ssl: {
    // In production, set to true and supply a CA certificate.
    // For local development against a self-signed cert, rejectUnauthorized can
    // be set to false via an env flag — never hardcode false unconditionally.
    rejectUnauthorized: process.env["OPENSEARCH_REJECT_UNAUTHORIZED"] !== "false",
  },
});

// ---------------------------------------------------------------------------
// testConnection
// Calls GET /_cluster/health. Logs success with cluster status or logs the
// error message if the cluster is unreachable. Never throws — callers use the
// return value to decide whether to proceed.
// ---------------------------------------------------------------------------

export async function testConnection(): Promise<boolean> {
  try {
    const response = await client.cluster.health();
    const health = response.body as ClusterHealthResponse;

    console.log(
      `[OpenSearch] Connected — cluster: "${health.cluster_name}", ` +
        `status: ${health.status}, nodes: ${health.number_of_nodes}`
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[OpenSearch] Connection failed — ${message}`);
    return false;
  }
}
