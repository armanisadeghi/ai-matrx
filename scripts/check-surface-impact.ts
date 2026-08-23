#!/usr/bin/env npx tsx
/**
 * check-surface-impact.ts — THE SURFACE BLAST-RADIUS SCREAMER
 *
 * Run this BEFORE you rename, retype, or delete a Surface Value (or a whole
 * surface). It answers the one question the manifest cannot: **who is already
 * mapped to this, and what breaks if I touch it?**
 *
 *   pnpm check:surface-impact                      # every surface: what is ALREADY broken + what the next sync would break
 *   pnpm check:surface-impact matrx-user/notes     # one surface: per-value consumer report + verdict
 *   pnpm check:surface-impact matrx-user/notes --value content
 *   pnpm check:surface-impact --strict             # exit 1 on any breakage (gate / pre-change guard)
 *   pnpm check:surface-impact --json
 *
 * WHY THIS EXISTS
 * A Surface Value is a NAME that outside things bind to by string:
 *   • agent bindings   — platform.associations (agent → surface), payload
 *                        value_mappings.<agent slot>.{mapType:"surface_value", target:"<value name>"}
 *   • write targets    — ui.ui_surface_write_target.updates_value (the read twin)
 *   • shortcuts        — agent.shortcut.scope_mappings / context_mappings (the
 *                        surface value name is the KEY) and value_mappings
 *                        (.target). NOTHING else in the repo checks these.
 *   • the DOM          — data-surface-value="<name>" attributes (locate-on-page)
 *   • feature tables   — FEATURE_VALUE_CONSUMERS below: feature-owned tables that
 *                        store surface value NAMES (e.g. docproc.page_extraction_jobs
 *                        .variable_mapping). Found the hard way on 2026-08-22:
 *                        9 live jobs mapped `filename` while this script printed
 *                        a confident "safe to change".
 *   • descendants      — every child surface inherits the name (child scope
 *                        builders take inherited alwaysAvailable keys as
 *                        REQUIRED params), so a parent value is load-bearing
 *                        for the whole family
 * Nothing in TypeScript sees those strings. Renaming `page_content` silently
 * turns a bound agent into an agent that receives nothing — the exact failure
 * "no fake menus" and the value-mapping guard exist to prevent at runtime.
 *
 * WHAT IT REPORTS (findings, worst first)
 *   ORPHAN_BINDING     a live binding targets a value that no longer exists on
 *                      that surface's resolved set → ALREADY BROKEN, fix now
 *   REMOVAL_BREAKS     a value exists in the DB mirror but NOT in code, and has
 *                      consumers → the next manifest sync deletes it and breaks them
 *   EMPTY_TARGET       mapType "surface_value" with no target → binding does nothing
 *   ORPHAN_WRITE_TWIN  write_target.updates_value points at a missing value
 *   SURFACE_ORPHANED   active DB surface with no manifest but with consumers/children
 *   ORPHAN_SHORTCUT    a shortcut maps a value name the surface no longer has
 *   ORPHAN_FEATURE_ROW a saved feature row (see FEATURE_VALUE_CONSUMERS) stores a
 *                      value name the family no longer declares
 *   SHADOWED_VALUE     a child re-declares a name its parent already conveys —
 *                      one concept, two declarations, split bindings
 *   RENAME_SUSPECT     a removed value + an added value of the same type on the
 *                      same surface → almost certainly a rename that must carry
 *                      its consumers across
 *
 * Truth order: CODE (ALL_MANIFESTS, inheritance resolved) is the vocabulary;
 * the DB is the mirror + the consumer ledger. Reads are PAGINATED (PostgREST
 * caps at 1000 — ui_surface_value alone is ~4.5k rows).
 *
 * Exit codes: 0 clean (or findings without --strict) · 1 findings with
 * --strict · 2 unexpected error · 3 no DB credentials (skipped, loud).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

type Severity = "error" | "warn";

interface Finding {
  kind:
    | "ORPHAN_BINDING"
    | "REMOVAL_BREAKS"
    | "EMPTY_TARGET"
    | "ORPHAN_WRITE_TWIN"
    | "SURFACE_ORPHANED"
    | "ORPHAN_SHORTCUT"
    | "ORPHAN_FEATURE_ROW"
    | "SHADOWED_VALUE"
    | "RENAME_SUSPECT";
  severity: Severity;
  surface: string;
  value?: string;
  detail: string;
  fix: string;
}

// ── env (same one-name-per-value contract as check-data-integrity) ──────────
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
        if (!m) continue;
        const [, k, raw] = m;
        if (want.includes(k) && !env[k])
          env[k] = (raw ?? "").replace(/^['"]|['"]$/g, "");
      }
    }
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = env.SUPABASE_SECRET_KEY ?? "";
  return url && key ? { url, key } : null;
}

/**
 * Paginated PostgREST read. A bare select caps at 1000 rows and would make
 * every "is anything mapped to this?" answer confidently wrong — the exact
 * class `lib/supabase/readAllRows.ts` exists to kill.
 */
async function readAll<T>(
  env: { url: string; key: string },
  schema: string,
  table: string,
  select: string,
  filter = "",
): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const url = `${env.url.replace(/\/$/, "")}/rest/v1/${table}?select=${encodeURIComponent(select)}${filter}`;
    const res = await fetch(url, {
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Accept-Profile": schema,
        Range: `${from}-${from + page - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!res.ok) {
      throw new Error(
        `${schema}.${table} read failed: ${res.status} ${await res.text()}`,
      );
    }
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

// ── shapes ──────────────────────────────────────────────────────────────────
interface ManifestLite {
  surfaceName: string;
  label?: string;
  inheritsFrom?: string;
  values: ReadonlyArray<{
    name: string;
    valueType: string;
    alwaysAvailable: boolean;
  }>;
  writeTargets?: ReadonlyArray<{ name: string; updatesValue?: string }>;
}
interface DbSurface {
  id: string;
  name: string;
  is_active: boolean;
  parent_surface_name: string | null;
}
interface DbValue {
  surface_name: string;
  name: string;
  value_type: string | null;
}
interface DbWriteTarget {
  surface_name: string;
  name: string;
  updates_value: string | null;
}
interface DbShortcut {
  id: string;
  label: string | null;
  surface_name: string | null;
  scope_mappings: Record<string, string> | null;
  context_mappings: Record<string, string> | null;
  value_mappings: Record<
    string,
    { mapType?: string; target?: string }
  > | null;
}
interface DbAssoc {
  id: string;
  target_id: string;
  role: string | null;
  source_id: string;
  payload: {
    value_mappings?: Record<
      string,
      { mapType?: string; target?: string; required?: boolean }
    >;
  } | null;
}

/**
 * FEATURE-OWNED CONSUMER TABLES.
 *
 * The platform tables above are generic. Individual features ALSO persist
 * surface value names — a run configuration, a saved mapping, a template — and
 * those are invisible to every generic check. Each entry here makes one such
 * table visible. Adding a feature table that stores a value name WITHOUT adding
 * it here is how a rename silently breaks saved user work.
 *
 * `direction: "key"` — the surface value name is the JSON KEY (the agent
 * variable is the value). `direction: "target"` — the name is `.target` inside
 * each entry, like a binding.
 */
const FEATURE_VALUE_CONSUMERS: ReadonlyArray<{
  schema: string;
  table: string;
  column: string;
  idColumn: string;
  labelColumn?: string;
  direction: "key" | "target";
  /** Surfaces (and their descendants) whose vocabulary this table stores. */
  surfaces: readonly string[];
  what: string;
  filter?: string;
  /**
   * True when the same map legitimately holds keys that are NOT surface values
   * (manual "extra inputs", runtime-only variables). Then an unknown key is a
   * WARN worth a human glance, never a confident BREAK — verified 2026-08-22
   * against `VariableMappingEditor`, whose dropdown mixes `surface`, `extras`
   * and `runtime` option kinds.
   */
  allowsNonSurfaceKeys?: boolean;
}> = [
  {
    schema: "docproc",
    table: "page_extraction_jobs",
    column: "variable_mapping",
    idColumn: "id",
    labelColumn: "name",
    direction: "key",
    surfaces: ["matrx-user/pdf-extractor"],
    what: "saved page-extraction job",
    allowsNonSurfaceKeys: true,
  },
];

interface Consumer {
  kind:
    | "binding"
    | "write-twin"
    | "shortcut"
    | "dom"
    | "feature-table"
    | "descendant";
  detail: string;
}

async function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const asJson = args.includes("--json");
  const valueFlagIdx = args.indexOf("--value");
  const focusValue = valueFlagIdx >= 0 ? args[valueFlagIdx + 1] : null;
  const focusSurface = args.find((a) => !a.startsWith("--") && a !== focusValue);

  // ── code truth ────────────────────────────────────────────────────────────
  const mod = await import(
    resolve(ROOT, "features/surfaces/manifests/registry")
  );
  // The 5 generic baselines are FLOORED at launch by `withBaselineScope`
  // regardless of `skipBaselineValues`, so a mapping that targets one of them
  // on an opt-out surface resolves to "" — silently empty, not a hard break.
  // Getting this severity wrong would send agents to "fix" a deliberate
  // opt-out by re-declaring baselines. Read the canonical list, never retype it.
  const baselineMod = await import(
    resolve(ROOT, "features/surfaces/manifests/_baseline.manifest")
  );
  const BASELINE = new Set<string>(baselineMod.BASELINE_VALUE_NAMES ?? []);
  const ALL: ReadonlyArray<ManifestLite> = mod.ALL_MANIFESTS;
  const RAW: ReadonlyArray<ManifestLite> = mod.RAW_MANIFESTS ?? ALL;

  const codeBySurface = new Map<string, ManifestLite>();
  for (const m of ALL) codeBySurface.set(m.surfaceName, m);

  // Children by manifest-declared parent (the registry is the ONE hierarchy
  // truth — ui_surface.parent_surface_name is a noisy mirror: 72 rows point at
  // matrx-default/default and cascade nothing).
  const childrenOf = new Map<string, string[]>();
  for (const m of RAW) {
    if (!m.inheritsFrom) continue;
    const list = childrenOf.get(m.inheritsFrom) ?? [];
    list.push(m.surfaceName);
    childrenOf.set(m.inheritsFrom, list);
  }
  const descendantsOf = (name: string): string[] => {
    const out: string[] = [];
    const walk = (n: string) => {
      for (const c of childrenOf.get(n) ?? []) {
        out.push(c);
        walk(c);
      }
    };
    walk(name);
    return out;
  };

  // ── db truth ──────────────────────────────────────────────────────────────
  const env = loadEnv();
  if (!env) {
    console.error(
      `${C.red}${C.bold}check:surface-impact SKIPPED — no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY.${C.reset}\n` +
        `  This check is the ONLY thing that sees who is mapped to a value. Running without it\n` +
        `  means you are changing surface vocabulary blind. Set the env and re-run.`,
    );
    process.exit(3);
  }

  const [surfaces, dbValues, writeTargets, assocs, shortcuts] = await Promise.all([
    readAll<DbSurface>(
      env,
      "ui",
      "ui_surface",
      "id,name,is_active,parent_surface_name",
    ),
    readAll<DbValue>(env, "ui", "ui_surface_value", "surface_name,name,value_type"),
    readAll<DbWriteTarget>(
      env,
      "ui",
      "ui_surface_write_target",
      "surface_name,name,updates_value",
    ),
    readAll<DbAssoc>(
      env,
      "platform",
      "associations",
      "id,target_id,role,source_id,payload",
      "&source_type=eq.agent&target_type=eq.surface&deleted_at=is.null",
    ),
    // agent.shortcut: the mapping store NOTHING else validates. Note the
    // REVERSED direction — in scope_mappings / context_mappings the surface
    // value name is the KEY; in value_mappings it is `.target`.
    readAll<DbShortcut>(
      env,
      "agent",
      "shortcut",
      "id,label,surface_name,scope_mappings,context_mappings,value_mappings",
      "&surface_name=not.is.null&deleted_at=is.null",
    ),
  ]);

  const surfaceById = new Map(surfaces.map((s) => [s.id, s]));
  const dbValuesBySurface = new Map<string, Set<string>>();
  const dbValueTypes = new Map<string, string | null>();
  for (const v of dbValues) {
    const set = dbValuesBySurface.get(v.surface_name) ?? new Set<string>();
    set.add(v.name);
    dbValuesBySurface.set(v.surface_name, set);
    dbValueTypes.set(`${v.surface_name}::${v.name}`, v.value_type);
  }

  /** Resolved (inheritance-included) code value set for a surface. */
  const codeValues = (name: string): Set<string> =>
    new Set((codeBySurface.get(name)?.values ?? []).map((v) => v.name));

  // ── consumer index: "<surface>::<value>" → consumers ──────────────────────
  const consumers = new Map<string, Consumer[]>();
  const addConsumer = (surface: string, value: string, c: Consumer) => {
    const key = `${surface}::${value}`;
    const list = consumers.get(key) ?? [];
    list.push(c);
    consumers.set(key, list);
  };

  const findings: Finding[] = [];

  // 1) agent bindings
  for (const a of assocs) {
    const surface = surfaceById.get(a.target_id);
    if (!surface) continue;
    const scope = a.role?.startsWith("binding:")
      ? a.role.slice("binding:".length)
      : (a.role ?? "?");
    const mappings = a.payload?.value_mappings ?? {};
    for (const [slot, m] of Object.entries(mappings)) {
      if (m?.mapType !== "surface_value") continue;
      const target = (m.target ?? "").trim();
      if (!target) {
        findings.push({
          kind: "EMPTY_TARGET",
          severity: "warn",
          surface: surface.name,
          detail: `agent ${a.source_id} slot "${slot}" maps to a surface value but names none (scope ${scope})`,
          fix: `Open the binding on /administration/ui/surfaces (or the header Agents panel → Settings) and pick a value, or switch the slot off surface_value.`,
        });
        continue;
      }
      addConsumer(surface.name, target, {
        kind: "binding",
        detail: `agent ${a.source_id} slot "${slot}" (${scope})`,
      });
      // Owner attribution: the value may be declared by an ancestor.
      const owner = ownerOf(surface.name, target);
      if (owner && owner !== surface.name) {
        addConsumer(owner, target, {
          kind: "binding",
          detail: `agent ${a.source_id} slot "${slot}" via child ${surface.name}`,
        });
      }
      const resolved = codeValues(surface.name);
      if (resolved.size > 0 && !resolved.has(target)) {
        const isBaseline = BASELINE.has(target);
        findings.push({
          kind: "ORPHAN_BINDING",
          severity: isBaseline ? "warn" : "error",
          surface: surface.name,
          value: target,
          detail: isBaseline
            ? `agent ${a.source_id} slot "${slot}" (${scope}) maps to the baseline "${target}", but ${surface.name} opts out of baselines (skipBaselineValues) — the launch floor fills it with "" so the agent runs on an EMPTY slot`
            : `agent ${a.source_id} slot "${slot}" (${scope}) maps to "${target}", which the surface no longer declares — that slot resolves to NOTHING at launch`,
          fix: isBaseline
            ? `Repoint the slot at a value ${surface.name} actually emits (that is why it opted out of baselines). Do NOT re-add baselines to an opt-out surface.`
            : `Either re-declare "${target}" in ${surface.name}'s manifest, or repoint the binding at the value that replaced it. Never leave it: the agent runs with a silently empty slot.`,
        });
      }
    }
  }

  /** Which surface in the ancestry actually declares this value. */
  function ownerOf(surface: string, value: string): string | null {
    let cur: string | undefined = surface;
    let declaredBy: string | null = null;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const raw = RAW.find((m) => m.surfaceName === cur);
      if (raw?.values?.some((v) => v.name === value)) declaredBy = cur;
      cur = raw?.inheritsFrom;
    }
    return declaredBy;
  }

  // 2) write twins
  for (const wt of writeTargets) {
    if (!wt.updates_value) continue;
    addConsumer(wt.surface_name, wt.updates_value, {
      kind: "write-twin",
      detail: `write target "${wt.name}" updates it`,
    });
    const resolved = codeValues(wt.surface_name);
    if (resolved.size > 0 && !resolved.has(wt.updates_value)) {
      findings.push({
        kind: "ORPHAN_WRITE_TWIN",
        severity: "error",
        surface: wt.surface_name,
        value: wt.updates_value,
        detail: `write target "${wt.name}" claims to update "${wt.updates_value}", which the surface does not declare`,
        fix: `Point updatesValue at a declared value (or declare it). An agent that writes here updates a value nothing can read back.`,
      });
    }
  }

  // 2b) shortcuts — the mapping store nothing else validates.
  //     scope_mappings / context_mappings: KEY = surface value name.
  //     value_mappings: `.target` = surface value name (same shape as bindings).
  for (const sc of shortcuts) {
    const sName = sc.surface_name;
    if (!sName) continue;
    const resolved = codeValues(sName);
    const label = sc.label ? `"${sc.label}"` : sc.id;
    const hits: Array<{ value: string; where: string }> = [];
    for (const key of Object.keys(sc.scope_mappings ?? {}))
      hits.push({ value: key, where: "scope_mappings" });
    for (const key of Object.keys(sc.context_mappings ?? {}))
      hits.push({ value: key, where: "context_mappings" });
    for (const [slot, m] of Object.entries(sc.value_mappings ?? {})) {
      if (m?.mapType !== "surface_value") continue;
      const t = (m.target ?? "").trim();
      if (t) hits.push({ value: t, where: `value_mappings.${slot}` });
    }
    for (const h of hits) {
      addConsumer(sName, h.value, {
        kind: "shortcut",
        detail: `shortcut ${label} ${h.where}`,
      });
      const owner = ownerOf(sName, h.value);
      if (owner && owner !== sName)
        addConsumer(owner, h.value, {
          kind: "shortcut",
          detail: `shortcut ${label} ${h.where} via child ${sName}`,
        });
      if (resolved.size > 0 && !resolved.has(h.value)) {
        const isBaseline = BASELINE.has(h.value);
        findings.push({
          kind: "ORPHAN_SHORTCUT",
          severity: isBaseline ? "warn" : "error",
          surface: sName,
          value: h.value,
          detail: isBaseline
            ? `shortcut ${label} ${h.where} references the baseline "${h.value}", but ${sName} opts out of baselines — the floor fills it with "" so the shortcut runs on an EMPTY slot`
            : `shortcut ${label} ${h.where} references "${h.value}", which ${sName} no longer declares — the shortcut runs with that slot empty`,
          fix: isBaseline
            ? `Repoint the shortcut at a value ${sName} emits (agent.shortcut ${sc.id}). Do NOT re-add baselines to an opt-out surface.`
            : `Repoint the shortcut mapping (agent.shortcut ${sc.id}) at a declared value, or re-declare "${h.value}".`,
        });
      }
    }
  }

  // 2b2) feature-owned consumer tables (FEATURE_VALUE_CONSUMERS).
  for (const spec of FEATURE_VALUE_CONSUMERS) {
    // A family's vocabulary = the ancestor's resolved set (children inherit it).
    const family = [
      ...spec.surfaces,
      ...spec.surfaces.flatMap((sn) => descendantsOf(sn)),
    ];
    const familyVocab = new Set<string>();
    for (const sn of family) for (const n of codeValues(sn)) familyVocab.add(n);
    if (familyVocab.size === 0) continue;

    let rows: Array<Record<string, unknown>> = [];
    try {
      rows = await readAll<Record<string, unknown>>(
        env,
        spec.schema,
        spec.table,
        `${spec.idColumn},${spec.labelColumn ? `${spec.labelColumn},` : ""}${spec.column}`,
        spec.filter ?? "",
      );
    } catch (err) {
      findings.push({
        kind: "ORPHAN_FEATURE_ROW",
        severity: "warn",
        surface: spec.surfaces[0],
        detail: `could not read ${spec.schema}.${spec.table} (${String(err).slice(0, 120)}) — its stored value names are UNCHECKED this run`,
        fix: `Fix the read (schema exposure / column names) in FEATURE_VALUE_CONSUMERS, or this consumer stays invisible.`,
      });
      continue;
    }

    for (const row of rows) {
      const map = row[spec.column];
      if (!map || typeof map !== "object") continue;
      const names =
        spec.direction === "key"
          ? Object.keys(map as Record<string, unknown>)
          : Object.values(map as Record<string, { target?: string }>)
              .map((v) => (v && typeof v === "object" ? (v.target ?? "") : ""))
              .filter(Boolean);
      const rowLabel = spec.labelColumn
        ? `${spec.what} "${String(row[spec.labelColumn] ?? row[spec.idColumn])}"`
        : `${spec.what} ${String(row[spec.idColumn])}`;
      for (const name of names) {
        // Attribute to the surface that actually declares it.
        const owner =
          spec.surfaces
            .map((sn) => ownerOf(sn, name))
            .find((o): o is string => Boolean(o)) ?? spec.surfaces[0];
        addConsumer(owner, name, {
          kind: "feature-table",
          detail: `${rowLabel} (${spec.schema}.${spec.table}.${spec.column})`,
        });
        if (!familyVocab.has(name)) {
          findings.push({
            kind: "ORPHAN_FEATURE_ROW",
            severity: spec.allowsNonSurfaceKeys ? "warn" : "error",
            surface: spec.surfaces[0],
            value: name,
            detail: spec.allowsNonSurfaceKeys
              ? `${rowLabel} stores "${name}", which the ${spec.surfaces[0]} family does not declare — either a manual/runtime input (fine) or a rename orphan that now fills with nothing (not fine). Worth one look.`
              : `${rowLabel} stores "${name}", which nothing in the ${spec.surfaces[0]} family declares — that slot fills with nothing when the job runs`,
            fix: `Open the saved row and confirm the slot still resolves; if it was a surface value that got renamed, repoint it. Saved user work does NOT follow a rename automatically.`,
          });
        }
      }
    }
  }

  // 2c) the DOM contract — data-surface-value="<name>" (locate-on-page). These
  //     are string literals TypeScript never sees; a rename orphans them
  //     silently. Static scan of the working tree.
  const domHits = new Map<string, string[]>(); // value name → files
  try {
    const { execSync } = await import("node:child_process");
    // grep, not rg: ripgrep is not installed on every machine that runs the
    // gates, and a silently skipped leg is worse than a slower one.
    const out = execSync(
      `grep -rhoE --include='*.tsx' --include='*.ts' 'data-surface-value="[a-z0-9_]+"' app features components 2>/dev/null | sort -u || true`,
      { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, shell: "/bin/bash" },
    );
    // -h drops filenames (portable across grep flavors); we count distinct
    // attribute names and re-locate files only when an agent asks for detail.
    for (const line of out.split("\n")) {
      const m = line.trim().match(/^data-surface-value="([a-z0-9_]+)"$/);
      if (!m) continue;
      const value = m[1];
      const list = domHits.get(value) ?? [];
      list.push("(grep for data-surface-value=\"" + value + "\")");
      domHits.set(value, list);
    }
  } catch {
    // rg missing — the DOM leg is best-effort, never the reason the check dies.
  }
  for (const m of RAW) {
    for (const v of m.values ?? []) {
      const files = domHits.get(v.name);
      if (!files?.length) continue;
      addConsumer(m.surfaceName, v.name, {
        kind: "dom",
        detail: `rendered as data-surface-value="${v.name}" in the DOM — ${files[0]}`,
      });
    }
  }

  // 3) descendants (inheritance is a consumer — the child's scope builder takes
  //    inherited alwaysAvailable keys as REQUIRED params)
  for (const m of RAW) {
    for (const v of m.values ?? []) {
      for (const d of descendantsOf(m.surfaceName)) {
        addConsumer(m.surfaceName, v.name, {
          kind: "descendant",
          detail: `${d} inherits it${v.alwaysAvailable ? " (REQUIRED param in its scope builder)" : ""}`,
        });
      }
    }
  }

  // 3b) shadowing — a child re-declaring a name the parent already conveys.
  //     Inheritance exists so the child does NOT restate the family vocabulary;
  //     two declarations of one concept mean bindings land on whichever copy
  //     the author happened to see. Same meaning → delete the child's copy.
  //     Different meaning → it needs its own name, not a shadow.
  for (const child of RAW) {
    if (!child.inheritsFrom) continue;
    const ownNames = new Set((child.values ?? []).map((v) => v.name));
    let cur: string | undefined = child.inheritsFrom;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const parent = RAW.find((m) => m.surfaceName === cur);
      for (const pv of parent?.values ?? []) {
        if (!ownNames.has(pv.name) || BASELINE.has(pv.name)) continue;
        const childV = child.values.find((v) => v.name === pv.name);
        // THE AVAILABILITY OVERRIDE (sanctioned): a child may re-declare a
        // parent value for the SOLE purpose of narrowing availability — the
        // parent always has it, this child sometimes doesn't. Deleting that
        // re-declaration would turn an honest "sometimes" into a promise the
        // child cannot keep, and the value-mapping guard would scream at
        // runtime. Same name, same type, alwaysAvailable true → false is
        // therefore CORRECT, not a shadow. Widening (false → true) is not:
        // the child cannot promise more than it emits.
        const narrowsAvailability =
          !!childV &&
          childV.valueType === pv.valueType &&
          pv.alwaysAvailable &&
          !childV.alwaysAvailable;
        if (narrowsAvailability) continue;
        const widensAvailability =
          !!childV && !pv.alwaysAvailable && childV.alwaysAvailable;
        findings.push({
          kind: "SHADOWED_VALUE",
          severity: "warn",
          surface: child.surfaceName,
          value: pv.name,
          detail: `re-declares "${pv.name}", which ${cur} already conveys by inheritance${
            childV && childV.valueType !== pv.valueType
              ? ` — and with a DIFFERENT type (${childV.valueType} vs ${pv.valueType}), so the same name means two things in one family`
              : widensAvailability
                ? ` — and PROMISES MORE than the parent (alwaysAvailable true where the parent says false); the child must actually emit it every time or the value-mapping guard screams`
                : ""
          }`,
          fix: `Same meaning → delete the child's declaration and let inheritance carry it (the scope builder still takes it as a param). Different meaning → give the child's value its own name. Only narrowing availability (parent always → child sometimes, same type) is a sanctioned re-declaration.`,
        });
      }
      cur = parent?.inheritsFrom;
    }
  }

  // 4) values the next sync would DELETE (in DB, gone from code) + rename hints
  for (const [surfaceName, dbSet] of dbValuesBySurface) {
    const manifest = codeBySurface.get(surfaceName);
    if (!manifest) continue; // handled by SURFACE_ORPHANED
    const code = codeValues(surfaceName);
    const removed = [...dbSet].filter((n) => !code.has(n));
    const added = [...code].filter((n) => !dbSet.has(n));
    for (const gone of removed) {
      const cons = consumers.get(`${surfaceName}::${gone}`) ?? [];
      if (cons.length > 0) {
        findings.push({
          kind: "REMOVAL_BREAKS",
          severity: "error",
          surface: surfaceName,
          value: gone,
          detail: `"${gone}" is gone from the manifest but still has ${cons.length} consumer(s): ${cons
            .slice(0, 4)
            .map((c) => c.detail)
            .join("; ")}${cons.length > 4 ? `; +${cons.length - 4} more` : ""}`,
          fix: `Restore the value, or migrate every consumer first (repoint bindings, update write targets, update child scope builders), then sync.`,
        });
      }
      const sameType = added.find(
        (a) =>
          dbValueTypes.get(`${surfaceName}::${gone}`) ===
          (manifest.values.find((v) => v.name === a)?.valueType ?? null),
      );
      if (sameType && cons.length > 0) {
        findings.push({
          kind: "RENAME_SUSPECT",
          severity: "warn",
          surface: surfaceName,
          value: gone,
          detail: `"${gone}" disappeared and "${sameType}" appeared with the same type — if this is a rename, ${cons.length} consumer(s) do NOT follow automatically`,
          fix: `Repoint each binding/write target/child builder from "${gone}" to "${sameType}" in the same change.`,
        });
      }
    }
  }

  // 5) surfaces alive in the DB with no manifest
  for (const s of surfaces) {
    if (!s.is_active || codeBySurface.has(s.name)) continue;
    const boundHere = assocs.filter((a) => a.target_id === s.id).length;
    const valueCount = dbValuesBySurface.get(s.name)?.size ?? 0;
    if (boundHere > 0 || valueCount > 0) {
      findings.push({
        kind: "SURFACE_ORPHANED",
        severity: boundHere > 0 ? "error" : "warn",
        surface: s.name,
        detail: `active DB surface with NO manifest — ${boundHere} agent binding(s), ${valueCount} value row(s) still live`,
        fix: `Create the manifest (surface-authoring) or retire the surface deliberately: migrate its bindings first, then deactivate the row.`,
      });
    }
  }

  // ── output ────────────────────────────────────────────────────────────────
  const scoped = focusSurface
    ? findings.filter(
        (f) =>
          f.surface === focusSurface ||
          descendantsOf(focusSurface).includes(f.surface),
      )
    : findings;

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          surface: focusSurface ?? null,
          value: focusValue ?? null,
          findings: scoped,
        },
        null,
        2,
      ),
    );
    process.exit(strict && scoped.some((f) => f.severity === "error") ? 1 : 0);
  }

  // Per-surface consumer report (the "is it safe to touch this?" mode)
  if (focusSurface) {
    const manifest = codeBySurface.get(focusSurface);
    if (!manifest) {
      console.error(`${C.red}No manifest for "${focusSurface}".${C.reset}`);
      process.exit(2);
    }
    const kids = descendantsOf(focusSurface);
    console.log(
      `\n${C.bold}${manifest.label ?? focusSurface}${C.reset} ${C.dim}${focusSurface}${C.reset}`,
    );
    if (manifest.inheritsFrom)
      console.log(`  ${C.dim}inherits${C.reset} ${manifest.inheritsFrom}`);
    if (kids.length)
      console.log(
        `  ${C.dim}descendants (${kids.length})${C.reset} ${kids.join(", ")}`,
      );
    console.log("");
    const rows = manifest.values.filter(
      (v) => !focusValue || v.name === focusValue,
    );
    for (const v of rows) {
      const cons = consumers.get(`${focusSurface}::${v.name}`) ?? [];
      const bindings = cons.filter((c) => c.kind === "binding");
      const twins = cons.filter((c) => c.kind === "write-twin");
      const shortcutsC = cons.filter((c) => c.kind === "shortcut");
      const domC = cons.filter((c) => c.kind === "dom");
      const featC = cons.filter((c) => c.kind === "feature-table");
      const kidsC = cons.filter((c) => c.kind === "descendant");
      const locked =
        bindings.length > 0 ||
        twins.length > 0 ||
        shortcutsC.length > 0 ||
        domC.length > 0 ||
        featC.length > 0;
      const badge = locked
        ? `${C.red}DO NOT RENAME/REMOVE${C.reset}`
        : kidsC.length > 0
          ? `${C.yellow}inherited — changes ripple${C.reset}`
          : `${C.green}safe to change${C.reset}`;
      console.log(
        `  ${C.cyan}${v.name}${C.reset} ${C.dim}(${v.valueType}${v.alwaysAvailable ? ", always" : ""})${C.reset}  ${badge}`,
      );
      for (const c of [...bindings, ...twins, ...shortcutsC, ...featC, ...domC])
        console.log(`      ${C.dim}↳ ${c.kind}: ${c.detail}${C.reset}`);
      if (kidsC.length)
        console.log(
          `      ${C.dim}↳ inherited by ${kidsC.length} descendant(s)${C.reset}`,
        );
    }
    console.log("");
  }

  if (focusSurface) {
    console.log(
      `${C.dim}  Checked: agent bindings · shortcuts · write twins · feature tables (${FEATURE_VALUE_CONSUMERS.map((f) => `${f.schema}.${f.table}`).join(", ")}) · data-surface-value · descendants.\n` +
        `  NOT checked: any other feature-owned table that stores value names, and hand-written\n` +
        `  scope-builder call sites. "safe to change" means "no consumer THIS script can see".${C.reset}\n`,
    );
  }

  const errors = scoped.filter((f) => f.severity === "error");
  const warns = scoped.filter((f) => f.severity === "warn");
  if (scoped.length === 0) {
    console.log(
      `${C.green}[ OK ]${C.reset} Surface impact clean — ${surfaces.length} surfaces, ${dbValues.length} value rows, ${assocs.length} agent bindings, ${shortcuts.length} shortcuts, ${writeTargets.length} write targets examined.`,
    );
    process.exit(0);
  }
  console.log(
    `${errors.length ? C.red : C.yellow}${C.bold}Surface impact: ${errors.length} breaking, ${warns.length} warning${C.reset}\n`,
  );
  for (const f of [...errors, ...warns]) {
    const tag = f.severity === "error" ? `${C.red}BREAK${C.reset}` : `${C.yellow}WARN ${C.reset}`;
    console.log(
      `${tag} ${C.bold}${f.kind}${C.reset} ${f.surface}${f.value ? ` · ${C.cyan}${f.value}${C.reset}` : ""}`,
    );
    console.log(`      ${f.detail}`);
    console.log(`      ${C.dim}fix: ${f.fix}${C.reset}`);
  }
  console.log("");
  process.exit(strict && errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(2);
});
