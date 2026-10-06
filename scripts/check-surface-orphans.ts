#!/usr/bin/env npx tsx
/**
 * check-surface-orphans.ts — THE NO-ORPHAN-ROW CHECK (Alchemy ALC-14).
 *
 *   pnpm check:surface-orphans              # list every orphan + the archive remedy
 *   pnpm check:surface-orphans --self-test  # prove it can go red AND green (no network)
 *   pnpm check:surface-orphans --json
 *
 * ORPHAN (AP-2 ruling): an ACTIVE (`is_active` true, `deleted_at` null)
 * `ui.ui_surface` row with `declared_by = 'code'` and NO declaring owner — no
 * code manifest (ALL_MANIFESTS / RAW_MANIFESTS) and no aidream server JSON
 * declaration. Rule 14: a retired surface is ARCHIVED (is_active = false), never
 * deleted. `declared_by = 'database'` rows (applets/*, org extensions) are never
 * orphans. This script archives NOTHING — it prints the list and the remedy for
 * a credentialed run.
 *
 * Exit: 0 no orphans · 1 orphans · 2 unexpected error · 3 UNMEASURED (no DB
 * credentials — never a silent pass).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(__dirname, "..");

export interface SurfaceRow {
  name: string;
  is_active: boolean;
  deleted_at: string | null;
  declared_by: string | null;
}

/** Pure ruling: which rows are orphans, given the set of declared owner names. */
export function findOrphans(rows: readonly SurfaceRow[], owners: ReadonlySet<string>): SurfaceRow[] {
  return rows.filter(
    (r) =>
      r.is_active === true &&
      r.deleted_at === null &&
      r.declared_by === "code" &&
      !owners.has(r.name),
  );
}

function selfTest(): number {
  const owners = new Set(["matrx-user/notes"]);
  const rows: SurfaceRow[] = [
    { name: "matrx-user/notes", is_active: true, deleted_at: null, declared_by: "code" }, // owned
    { name: "old/gone", is_active: true, deleted_at: null, declared_by: "code" }, // ORPHAN
    { name: "applets/x", is_active: true, deleted_at: null, declared_by: "database" }, // never an orphan
    { name: "old/archived", is_active: false, deleted_at: null, declared_by: "code" }, // already archived
    { name: "old/deleted", is_active: true, deleted_at: "2026-01-01", declared_by: "code" }, // soft-deleted
  ];
  const red = findOrphans(rows, owners).map((r) => r.name);
  const green = findOrphans(rows.filter((r) => r.name !== "old/gone"), owners);
  const ok = red.length === 1 && red[0] === "old/gone" && green.length === 0;
  console.log(ok ? "check:surface-orphans self-test OK (red on orphan, green without)" : `self-test FAILED: red=${JSON.stringify(red)} green=${green.length}`);
  return ok ? 0 : 1;
}

function loadEnv(): { url: string; key: string } | null {
  const env: Record<string, string> = {};
  const want = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"];
  for (const k of want) if (process.env[k]) env[k] = process.env[k] as string;
  if (!env.SUPABASE_SECRET_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) {
    for (const f of [".env.local", ".env.production.local", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (m && want.includes(m[1]) && !env[m[1]]) env[m[1]] = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
      }
    }
  }
  return env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SECRET_KEY
    ? { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SECRET_KEY }
    : null;
}

async function readAll(env: { url: string; key: string }): Promise<SurfaceRow[]> {
  const out: SurfaceRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const filter = "&is_active=eq.true&deleted_at=is.null&declared_by=eq.code";
    const url = `${env.url.replace(/\/$/, "")}/rest/v1/ui_surface?select=name,is_active,deleted_at,declared_by${filter}`;
    const res = await fetch(url, {
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Accept-Profile": "ui",
        Range: `${from}-${from + page - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!res.ok) throw new Error(`ui.ui_surface read failed: ${res.status} ${await res.text()}`);
    const rows = (await res.json()) as SurfaceRow[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

/** Server-side JSON declarations (aidream) are declaring owners too. Absent → announced. */
function serverDeclarationNames(): Set<string> {
  const dir = resolve(ROOT, "..", "aidream", "aidream", "services", "tooling", "surface_declarations");
  const names = new Set<string>();
  if (!existsSync(dir)) {
    console.warn(`[surface-orphans] server declarations not found at ${dir}; rows they own will report as orphans.`);
    return names;
  }
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const p = JSON.parse(readFileSync(resolve(dir, f), "utf8")) as { surfaceName?: unknown };
    if (typeof p.surfaceName === "string") names.add(p.surfaceName);
  }
  return names;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) exitAfterDrain(selfTest());
  const asJson = args.includes("--json");

  const env = loadEnv();
  if (!env) {
    console.error(
      "check:surface-orphans UNMEASURED — no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY. " +
        "Orphan rows cannot be listed without reading ui.ui_surface live; this is NOT a pass.",
    );
    exitAfterDrain(3);
  }

  const mod = await import(resolve(ROOT, "features/surfaces/manifests/registry"));
  const owners = new Set<string>();
  for (const m of [...(mod.ALL_MANIFESTS ?? []), ...(mod.RAW_MANIFESTS ?? [])]) owners.add(m.surfaceName);
  for (const n of serverDeclarationNames()) owners.add(n);

  const rows = await readAll(env!);
  const orphans = findOrphans(rows, owners).sort((a, b) => a.name.localeCompare(b.name));
  if (asJson) console.log(JSON.stringify(orphans.map((o) => o.name)));
  if (orphans.length === 0) {
    if (!asJson) console.log(`check:surface-orphans OK — every active code-declared surface row has a declaring owner (${owners.size} owners, ${rows.length} rows read).`);
    exitAfterDrain(0);
  }
  if (!asJson) {
    console.error(`check:surface-orphans — ${orphans.length} ORPHAN row(s): active, declared_by='code', no manifest and no server declaration:`);
    for (const o of orphans) console.error(`  - ${o.name}`);
    console.error(
      "\nRemedy (a credentialed run; rule 14 — archive, NEVER delete): declare the surface (manifest), or archive it:\n" +
        "  update ui.ui_surface set is_active = false where declared_by = 'code' and deleted_at is null and name in (" +
        orphans.map((o) => `'${o.name.replace(/'/g, "''")}'`).join(", ") +
        ");",
    );
  }
  exitAfterDrain(1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    exitAfterDrain(2);
  });
}
