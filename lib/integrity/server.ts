// lib/integrity/server.ts
//
// Server-side adapters that wire the integrity framework to live infrastructure:
//   - a SqlRunner backed by the `execute_admin_query` SECURITY DEFINER RPC
//     (same path the admin SQL editor uses), via the RLS-bypassing admin client.
//   - a FileProbe backed by the Python `/files/{id}/download` endpoint.
//
// Kept out of the route file so a CLI/cron caller could reuse the SQL runner too.

import { createAdminClient } from "@/utils/supabase/adminClient";
import type { FileProbe, IntegrityFinding, SqlRunner } from "./types";
import { unwrapRows } from "./unwrap";

/** SQL runner using the admin client + execute_admin_query RPC. */
export function createAdminSqlRunner(): SqlRunner {
  const admin = createAdminClient();
  return async (query: string): Promise<IntegrityFinding[]> => {
    const { data, error } = await admin.rpc("execute_admin_query", { query });
    if (error) throw new Error(error.message);
    return unwrapRows(data);
  };
}

function resolveBackendUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_BACKEND_URL_PROD ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL_EC2 ??
    null;
  return url ? url.replace(/\/$/, "") : null;
}

/**
 * Builds a FileProbe that range-probes the download endpoint with the given
 * bearer token. Returns null when no token or backend URL is available (the
 * caller then reports the probe check as skipped).
 */
export function createDownloadProbe(
  token: string | null,
): FileProbe | undefined {
  const backend = resolveBackendUrl();
  if (!token || !backend) return undefined;

  return async (fileId: string) => {
    const start = Date.now();
    const url = `${backend}/files/${encodeURIComponent(fileId)}/download?inline=true`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          // Cheap liveness probe — just the first byte.
          Range: "bytes=0-0",
        },
      });
      // Drain the (tiny) body so the socket can be reused/closed.
      await res.arrayBuffer().catch(() => undefined);
      return { status: res.status, ms: Date.now() - start };
    } catch (err) {
      return {
        status: null,
        ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
}
