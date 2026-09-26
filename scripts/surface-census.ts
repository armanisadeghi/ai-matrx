/**
 * surface-census — the facts behind the surface campaign's one list.
 *
 * For every registered surface: its readiness and note AS DECLARED, its host
 * (route or overlay), how many values it declares, and — computed from source,
 * never self-reported — whether anything emits it: the manifest module's
 * `create…Scope` builder has at least one call site outside the manifest file.
 *
 * Why a script and not a hand-kept list: on 2026-09-25 the only lists were
 * self-declarations (78 manifests said "verified", 16 surfaces had ever been
 * certified), and a regex census read a header comment instead of the field.
 * This imports the registry and each manifest module, so it reads what the app
 * reads.
 *
 * Usage:
 *   pnpm surface:census                 # markdown table to stdout
 *   pnpm surface:census --json out.json # also write JSON
 *   pnpm surface:census --sql           # print a read-only SQL query that
 *                                       # returns every surface whose DB mirror
 *                                       # (ui.ui_surface / ui_surface_value)
 *                                       # disagrees with code — run it through
 *                                       # the Supabase MCP.
 *   pnpm surface:census --only not-emitting   # filter rows
 */

import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { getAllManifests } from "@/features/surfaces/manifests/registry";

const MANIFEST_DIR = "features/surfaces/manifests";
// Same resolution path as the registry's own static imports (a dynamic import()
// by file URL takes the ESM path, which one package's exports map refuses).
const requireModule = createRequire(__filename);

type Row = {
  surface: string;
  label: string;
  readiness: string;
  host: string;
  values: number;
  scopeBuilders: string[];
  emitterFiles: string[];
  emitting: boolean;
  readinessNote: string;
};

function callSites(fnName: string, manifestFile: string): string[] {
  try {
    const out = execFileSync(
      "git",
      ["grep", "-lw", fnName, "--", "*.ts", "*.tsx", ":!features/surfaces/manifests/*.manifest.ts"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && l !== manifestFile && !l.includes(".test."));
  } catch {
    return []; // git grep exits 1 when nothing matches
  }
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : undefined;
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;

  // Map each manifest module to its surface name(s) and its scope builders.
  const buildersBySurface = new Map<string, { file: string; builders: string[] }>();
  for (const file of readdirSync(MANIFEST_DIR).filter((f) => f.endsWith(".manifest.ts"))) {
    const rel = path.join(MANIFEST_DIR, file);
    const mod = requireModule(path.resolve(rel)) as Record<string, unknown>;
    const builders = Object.entries(mod)
      .filter(([k, v]) => typeof v === "function" && /^create[A-Za-z0-9]*Scope$/.test(k))
      .map(([k]) => k);
    for (const value of Object.values(mod)) {
      if (value && typeof value === "object" && typeof (value as { surfaceName?: unknown }).surfaceName === "string") {
        buildersBySurface.set((value as { surfaceName: string }).surfaceName, { file: rel, builders });
      }
    }
  }

  const rows: Row[] = getAllManifests().map((m) => {
    const entry = buildersBySurface.get(m.surfaceName);
    const emitterFiles = entry
      ? [...new Set(entry.builders.flatMap((b) => callSites(b, entry.file)))]
      : [];
    return {
      surface: m.surfaceName,
      label: m.label,
      readiness: m.readiness,
      host: m.overlayId ? `overlay:${m.overlayId}` : (m.urlPattern ?? "(none)"),
      values: m.values.length,
      scopeBuilders: entry?.builders ?? [],
      emitterFiles,
      emitting: emitterFiles.length > 0,
      readinessNote: (m.readinessNote ?? "").replace(/\s+/g, " ").trim(),
    };
  });

  if (args.includes("--sql")) {
    const values = rows
      .map((r) => `('${r.surface.replace(/'/g, "''")}','${r.readiness}',${r.values})`)
      .join(",\n  ");
    console.log(`-- Surfaces whose DB mirror disagrees with code (read-only).
with code(name, readiness, n_values) as (values
  ${values}
)
select coalesce(c.name, s.name) as surface,
       c.readiness as code_readiness, s.readiness as db_readiness,
       c.n_values as code_values,
       (select count(*) from ui.ui_surface_value v where v.surface_name = coalesce(c.name, s.name)) as db_values,
       s.check_claimed_by, s.check_claimed_at,
       case when c.name is null then 'db row with no manifest'
            when s.name is null then 'never synced'
            else 'differs' end as problem
from code c full join ui.ui_surface s on s.name = c.name
where c.name is null or s.name is null
   or c.readiness is distinct from s.readiness
   or c.n_values <> (select count(*) from ui.ui_surface_value v where v.surface_name = c.name)
order by 1;`);
    return;
  }

  const filtered = rows.filter((r) =>
    only === "not-emitting" ? !r.emitting : only ? r.readiness === only : true,
  );
  const totals = {
    surfaces: rows.length,
    emitting: rows.filter((r) => r.emitting).length,
    notEmitting: rows.filter((r) => !r.emitting).length,
    verified: rows.filter((r) => r.readiness === "verified").length,
    partial: rows.filter((r) => r.readiness === "partial").length,
    stub: rows.filter((r) => r.readiness === "stub").length,
    verifiedButNotEmitting: rows.filter((r) => r.readiness === "verified" && !r.emitting).map((r) => r.surface),
  };

  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ totals, rows }, null, 2));
  console.log(
    `Surfaces: ${totals.surfaces} · emitting ${totals.emitting} · not emitting ${totals.notEmitting} · ` +
      `declared verified ${totals.verified} / partial ${totals.partial} / stub ${totals.stub}`,
  );
  if (totals.verifiedButNotEmitting.length)
    console.log(`Declared verified but nothing emits them: ${totals.verifiedButNotEmitting.join(", ")}`);
  console.log("\n| surface | readiness | emitting | values | host |\n|---|---|---|---|---|");
  for (const r of filtered)
    console.log(`| ${r.surface} | ${r.readiness} | ${r.emitting ? "yes" : "NO"} | ${r.values} | ${r.host} |`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
