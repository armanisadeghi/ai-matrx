// lib/integrity/server.ts
//
// Server-side adapters that wire the integrity framework to live infrastructure:
//   - a SqlRunner backed by the `execute_admin_query` SECURITY DEFINER RPC
//     (same path the admin SQL editor uses), via the RLS-bypassing admin client.
//   - a FileProbe backed by the Python `/files/{id}/download` endpoint.
//
// Kept out of the route file so a CLI/cron caller could reuse the SQL runner too.

import { spawn } from "node:child_process";
import { createAdminClient } from "@/utils/supabase/adminClient";
import type {
  FileProbe,
  IntegrityFinding,
  ScriptRunner,
  SqlRunner,
} from "./types";
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

const SCRIPT_DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const SCRIPT_OUTPUT_CAP = 64 * 1024; // keep only the trailing 64 KB

/**
 * ScriptRunner that shells out to `pnpm run <script>` at the repo root.
 * Returns undefined on serverless hosts (Vercel) where the repo's dev
 * toolchain isn't available — script checks then report `skipped`.
 * Only ever invoked from the super-admin integrity route, with script names
 * taken from the static check registry (never caller input).
 */
export function createScriptRunner(): ScriptRunner | undefined {
  if (process.env.VERCEL) return undefined;

  return (def) =>
    new Promise((resolvePromise) => {
      const timeoutMs = def.timeoutMs ?? SCRIPT_DEFAULT_TIMEOUT_MS;
      let output = "";
      let settled = false;
      const append = (chunk: Buffer) => {
        output += chunk.toString("utf8");
        if (output.length > SCRIPT_OUTPUT_CAP) {
          output = output.slice(-SCRIPT_OUTPUT_CAP);
        }
      };
      const finish = (exitCode: number | null, error?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise({ exitCode, output, ...(error ? { error } : {}) });
      };

      const child = spawn("pnpm", ["run", def.script], {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(null, `gate timed out after ${timeoutMs}ms and was killed`);
      }, timeoutMs);

      child.stdout.on("data", append);
      child.stderr.on("data", append);
      child.on("error", (err) => finish(null, err.message));
      child.on("close", (code) => finish(code));
    });
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
