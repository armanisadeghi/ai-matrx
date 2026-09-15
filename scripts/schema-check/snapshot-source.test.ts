/**
 * The schema snapshot has exactly ONE source, and a failure to get it is loud.
 *
 * Break this guards (2026-09-14, 17 false entity-registry-drift errors):
 *   - the refresher, refused by the live RPC (42501), wrote the older aidream
 *     snapshot over the committed one and exited 0;
 *   - the loader, given a missing or corrupt snapshot, quietly degraded to the
 *     aidream snapshot / types/database.types.ts / an empty snapshot.
 *
 * The refresher cases run the REAL script bytes as a child process against a
 * local HTTP server, inside a throwaway checkout layout that also plants the
 * aidream snapshot the old code fell back to — so the fallback is reachable and
 * its absence is proven, not assumed. The success case proves the harness can
 * actually reach the server (the failure cases are not vacuous).
 */
import { execFile, type ExecFileException } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadSnapshot } from "./snapshot";

const HERE = __dirname;
const REPO = resolve(HERE, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");

const COMMITTED = JSON.stringify({
  _comment: "sentinel",
  generated_at: "2026-01-01T00:00:00Z",
  exposed_schemas: ["public"],
  schemas: { public: ["sentinel"] },
  views: {},
});
const AIDREAM_BLOB = JSON.stringify([{ result: { schemas: { public: ["from_aidream"] }, views: {} } }]);

function layout(): { base: string; fe: string; out: string } {
  const base = mkdtempSync(join(tmpdir(), "schema-snapshot-"));
  const fe = join(base, "fe");
  const dir = join(fe, "scripts", "schema-check");
  mkdirSync(dir, { recursive: true });
  for (const f of ["get-current-schema.ts", "supabase-env.ts"]) copyFileSync(join(HERE, f), join(dir, f));
  const out = join(dir, "current-schema.json");
  writeFileSync(out, COMMITTED);
  mkdirSync(join(base, "aidream", "db", "schema_analysis"), { recursive: true });
  writeFileSync(join(base, "aidream", "db", "schema_analysis", "current_schemas.json"), AIDREAM_BLOB);
  return { base, fe, out };
}

function runRefresher(fe: string, env: Record<string, string>): Promise<{ code: number; output: string }> {
  return new Promise((done) => {
    execFile(
      TSX,
      [join(fe, "scripts", "schema-check", "get-current-schema.ts")],
      { cwd: fe, env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env }, timeout: 60_000, encoding: "utf8" },
      (err: ExecFileException | null, stdout: string, stderr: string) => {
        const code = err ? (typeof err.code === "number" ? err.code : 1) : 0;
        done({ code, output: `${stdout}${stderr}` });
      },
    );
  });
}

function serve(status: number, body: string): Promise<{ server: Server; url: string }> {
  return new Promise((ready) => {
    const server = createServer((_req, res) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(body);
    });
    server.listen(0, "127.0.0.1", () => ready({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
  });
}

describe("schema snapshot refresher (get-current-schema.ts)", () => {
  jest.setTimeout(90_000);

  it("a refused RPC exits non-zero, names the remedy, and leaves the snapshot untouched", async () => {
    const { base, fe, out } = layout();
    const { server, url } = await serve(401, JSON.stringify({ code: "42501", message: "permission denied for function schema_truth_snapshot" }));
    try {
      const r = await runRefresher(fe, { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: "sb_secret_test" });
      expect(r.code).not.toBe(0);
      expect(r.output).toContain("FAIL");
      expect(r.output).toContain("SUPABASE_SECRET_KEY");
      expect(readFileSync(out, "utf8")).toBe(COMMITTED);
    } finally {
      server.close();
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("no credentials exits non-zero and leaves the snapshot untouched", async () => {
    const { base, fe, out } = layout();
    try {
      const r = await runRefresher(fe, {});
      expect(r.code).not.toBe(0);
      expect(r.output).toContain("FAIL");
      expect(readFileSync(out, "utf8")).toBe(COMMITTED);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("a successful RPC writes the live snapshot (proves the harness reaches the server)", async () => {
    const { base, fe, out } = layout();
    const live = { generated_at: "2026-09-14T12:00:00Z", project: "postgres", source: "schema_truth_snapshot()", exposed_schemas: ["public"], schemas: { public: ["live_table"] }, views: {} };
    const { server, url } = await serve(200, JSON.stringify(live));
    try {
      const r = await runRefresher(fe, { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: "sb_secret_test" });
      expect(r.code).toBe(0);
      const written = JSON.parse(readFileSync(out, "utf8"));
      expect(written.generated_at).toBe(live.generated_at);
      expect(written.schemas).toEqual(live.schemas);
    } finally {
      server.close();
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("schema snapshot loader (snapshot.ts loadSnapshot)", () => {
  function root(fe?: string): { base: string; fe: string } {
    const base = mkdtempSync(join(tmpdir(), "schema-load-"));
    const feRoot = join(base, "fe");
    mkdirSync(join(feRoot, "scripts", "schema-check"), { recursive: true });
    mkdirSync(join(feRoot, "types"), { recursive: true });
    // The legs the old loader degraded to — present, so their absence is proven.
    writeFileSync(join(feRoot, "types", "database.types.ts"), "export type Database = {};\n");
    mkdirSync(join(base, "aidream", "db", "schema_analysis"), { recursive: true });
    writeFileSync(join(base, "aidream", "db", "schema_analysis", "current_schemas.json"), AIDREAM_BLOB);
    if (fe !== undefined) writeFileSync(join(feRoot, "scripts", "schema-check", "current-schema.json"), fe);
    return { base, fe: feRoot };
  }

  it("a missing snapshot throws, naming the file and the remedy", () => {
    const { base, fe } = root();
    try {
      expect(() => loadSnapshot(fe)).toThrow(/current-schema\.json[\s\S]*pnpm check:schema:snapshot/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("a corrupt snapshot throws, naming the file and the remedy", () => {
    const { base, fe } = root("{ not json");
    try {
      expect(() => loadSnapshot(fe)).toThrow(/current-schema\.json[\s\S]*pnpm check:schema:snapshot/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("a valid snapshot loads and carries its generated_at into the printed source", () => {
    const { base, fe } = root(COMMITTED);
    try {
      const snap = loadSnapshot(fe);
      expect(snap.generatedAt).toBe("2026-01-01T00:00:00Z");
      expect(snap.source).toContain("2026-01-01T00:00:00Z");
      expect(snap.tables.get("public")?.has("sentinel")).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
