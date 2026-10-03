// scripts/record-pages/census.ts — THE RECORD-VIEW CENSUS (lane 7 STANDARD-TABLES W5, guard G1).
//
// Owner (Arman): custom fields on every feature's records through the same mechanism as custom
// tables — "all of this has to work together or it's all worthless." Champion: Salesforce — one
// field definition appears on every layout and list view with no per-object code.
//
// So every place a record can be shown is counted, and each one says, IN ITS OWN FILE, which record
// it shows. Nothing here is a hand-kept map from URL to token (C3/C4 of the D45 attack): the page→token
// map is GENERATED from what each file declares.
//
// THE CENSUS (every unit below must declare):
//   route   every route in lib/route-manifest/manifest.generated.json — dynamic AND static (C4: /notes,
//           /code, /transcripts/processor show records addressed by a query string, not a segment)
//   window  every component OverlayController.tsx lazy-loads (the window panels)
//   peek    every features/organizations/peek/kinds/*Peek.tsx (M3)
//
// A FILE DECLARES, in one of three ways:
//   1. it renders `<EntityCustomFields entityToken="<token>"` itself — the literal is the declaration;
//   2. a marker in its first 30 lines:
//        // record-view: <token>[, <token>…]    the mount is in a component the file renders (checked:
//                                              the literal must be reachable through its imports)
//        // record-view: host                  it renders records through the Detail host, which shows
//                                              every token's section through ONE port (checked: the
//                                              file reaches DetailBody/the Detail host, and the host
//                                              binds `customFields`)
//        // record-view: none — <reason>        it shows no single record (a list, a settings page)
//   3. nothing — then it is PENDING, and the pending ledger (lib/record-pages/pending.json) may only
//      shrink: a new undeclared unit fails G1, a declared unit still in the ledger fails G1 (stale).
//
// THE "NONE" EXEMPTIONS ARE A RATCHET TOO: units that show no section (pending + "none") may not rise
// above `exemptCeiling`. Moving a pending unit to "none" keeps the total (allowed: it is classified, not
// added); a NEW page marked "none" raises it and fails. The ceiling only comes down (`--shrink`).
//
// LISTS (I2): every file rendering `<MatrxDataTable` sets `rowToken=` (the table host then adds the
// custom-field columns of that token), or carries `// row-token: none — <reason>`, or is in the
// ledger's `tablesPending` (same shrink-only rule).
//
// TOKENS are judged against lib/record-pages/entity-types.snapshot.json (refreshed from production by
// `generate.ts --refresh-registry`; a stand-in until the associations generator carries `type` and
// `customFieldsEnabled` — a package change routed to the chair). A declared token must be an active
// Entity/Detail token with custom fields enabled. A token whose table has no organization_id column
// (M2) is reported in `noOrganization`: its section answers "belong to a person … no custom fields yet"
// from custom.entity_record_home, until the store's field doors learn an owner column.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export type UnitKind = "route" | "window" | "peek";
export type Declaration =
  | { kind: "tokens"; tokens: string[]; via: "literal" | "marker" }
  | { kind: "host" }
  | { kind: "none"; reason: string }
  | { kind: "pending" };

export interface Unit {
  key: string; // "route:/projects/[id]" | "window:<file>" | "peek:<file>"
  kind: UnitKind;
  file: string; // repo-relative
  declaration: Declaration;
}

export interface TableUnit {
  file: string;
  rowToken: "set" | "none" | "pending";
  reason?: string;
}

export interface EntityTypeRow {
  token: string;
  type: string;
  custom_fields_enabled: boolean;
  is_active: boolean;
  has_organization: boolean;
}

export interface Ledger {
  exemptCeiling: number;
  pending: string[];
  tablesPending: string[];
}

export interface Census {
  units: Unit[];
  tables: TableUnit[];
  problems: string[];
  noOrganization: string[];
  counts: Record<string, number>;
}

const MARKER = /^\s*\/\/\s*record-view:\s*(.+?)\s*$/m;
const ROW_TOKEN_MARKER = /\/\/\s*row-token:\s*none\s*[—-]+\s*(\S.*)$/m;
const LITERAL = /<EntityCustomFields\b[^>]*?entityToken=["']([a-z0-9_]+)["']/gs;
const HOST_REACH = /\b(DetailBody|DetailHostProvider|DetailPageRoute|DetailWindow|RecordPeekCanvasView|DetailHost)\b/;
const EXTS = [".tsx", ".ts", "/index.tsx", "/index.ts", ".jsx", ".js"];
const MAX_CLOSURE = 600;

export interface CensusOptions {
  root: string;
  /** repo-relative path → replacement content (plants, scratch copies). Never touches the real file. */
  overrides?: Record<string, string>;
  /** extra census units for plants: route pattern → source file (repo-relative). */
  extraRoutes?: { pattern: string; source: string }[];
  entityTypes: EntityTypeRow[];
  ledger: Ledger;
}

export function buildCensus(opts: CensusOptions): Census {
  const { root } = opts;
  const overrides = opts.overrides ?? {};
  const cache = new Map<string, string | null>();
  const read = (rel: string): string | null => {
    if (rel in overrides) return overrides[rel];
    if (cache.has(rel)) return cache.get(rel)!;
    const abs = join(root, rel);
    const text = existsSync(abs) ? readFileSync(abs, "utf8") : null;
    cache.set(rel, text);
    return text;
  };
  const resolveImport = (fromRel: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith(".")) base = relative(root, resolve(join(root, dirname(fromRel)), spec));
    else return null;
    if (/\.(tsx?|jsx?)$/.test(base) && read(base) !== null) return base;
    for (const ext of EXTS) if (read(base + ext) !== null) return base + ext;
    return null;
  };
  const importsOf = (rel: string): string[] => {
    const text = read(rel);
    if (!text) return [];
    const out: string[] = [];
    const re = /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const r = resolveImport(rel, m[1] ?? m[2]);
      if (r) out.push(r);
    }
    return out;
  };
  // Breadth-first over the file's own imports: does `test` hold somewhere it renders?
  const reaches = (rel: string, test: (text: string) => boolean): boolean => {
    const seen = new Set<string>([rel]);
    const queue = [rel];
    while (queue.length && seen.size <= MAX_CLOSURE) {
      const cur = queue.shift()!;
      const text = read(cur);
      if (text && test(text)) return true;
      for (const next of importsOf(cur)) {
        if (!seen.has(next) && !next.startsWith("node_modules/")) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return false;
  };
  const literalTokens = (text: string): string[] => {
    const out = new Set<string>();
    for (const m of text.matchAll(LITERAL)) out.add(m[1]);
    return [...out];
  };

  const types = new Map(opts.entityTypes.map((t) => [t.token, t]));
  const problems: string[] = [];
  const noOrganization = new Set<string>();
  const judgeToken = (where: string, token: string) => {
    const t = types.get(token);
    if (!t) return problems.push(`${where}: declares "${token}", which is not a registry token.`);
    if (!t.is_active) return problems.push(`${where}: declares "${token}", a retired token.`);
    if (!["entity", "detail"].includes(t.type.toLowerCase()) || !t.custom_fields_enabled)
      return problems.push(`${where}: declares "${token}", a ${t.type} table, which takes no custom fields.`);
    if (!t.has_organization) noOrganization.add(token);
  };

  const declare = (key: string, rel: string): Declaration => {
    const text = read(rel);
    if (text === null) {
      problems.push(`${key}: its file ${rel} does not exist.`);
      return { kind: "pending" };
    }
    const head = text.split("\n").slice(0, 30).join("\n");
    const marker = head.match(MARKER)?.[1];
    if (marker) {
      const none = marker.match(/^none\b\s*(?:[—-]+\s*(.*))?$/);
      if (none) {
        const reason = (none[1] ?? "").trim();
        if (!reason) problems.push(`${key}: "record-view: none" with no reason (${rel}).`);
        return { kind: "none", reason };
      }
      if (marker === "host") {
        if (!reaches(rel, (t) => HOST_REACH.test(t)))
          problems.push(`${key}: declares "host" but renders no Detail host (${rel}).`);
        return { kind: "host" };
      }
      const tokens = marker.split(/[,\s]+/).filter(Boolean);
      for (const token of tokens) {
        judgeToken(key, token);
        const re = new RegExp(`<EntityCustomFields\\b[^>]*?entityToken=["']${token}["']`, "s");
        if (!reaches(rel, (t) => re.test(t)))
          problems.push(
            `${key}: declares "${token}" but renders no <EntityCustomFields entityToken="${token}"> (${rel} and what it imports).`,
          );
      }
      return { kind: "tokens", tokens, via: "marker" };
    }
    const literal = literalTokens(text);
    if (literal.length) {
      for (const token of literal) judgeToken(key, token);
      return { kind: "tokens", tokens: literal, via: "literal" };
    }
    return { kind: "pending" };
  };

  // ── routes ──
  const manifest = JSON.parse(read("lib/route-manifest/manifest.generated.json") ?? '{"routes":[]}') as {
    routes: { pattern: string; source: string }[];
  };
  const routes = [...manifest.routes, ...(opts.extraRoutes ?? [])];
  const units: Unit[] = [];
  const seenKeys = new Set<string>();
  let missing = 0;
  for (const r of routes) {
    const key = `route:${r.pattern}`;
    if (seenKeys.has(key)) continue;
    // A manifest row whose page file is gone is the manifest's staleness, not a record view.
    if (read(r.source) === null) {
      missing++;
      continue;
    }
    seenKeys.add(key);
    units.push({ key, kind: "route", file: r.source, declaration: declare(key, r.source) });
  }
  // ── windows ──
  const controller = "features/overlays/OverlayController.tsx";
  const controllerText = read(controller) ?? "";
  const windowFiles = new Set<string>();
  for (const m of controllerText.matchAll(/lazyOverlay\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']/g)) {
    const r = resolveImport(controller, m[1]);
    if (r) windowFiles.add(r);
  }
  for (const f of [...windowFiles].sort()) {
    const key = `window:${f}`;
    units.push({ key, kind: "window", file: f, declaration: declare(key, f) });
  }
  // ── peeks ──
  const peekDir = "features/organizations/peek/kinds";
  const peekFiles = existsSync(join(root, peekDir))
    ? readdirSync(join(root, peekDir)).filter((f) => /Peek\.tsx$/.test(f) && !f.endsWith(".test.tsx"))
    : [];
  for (const f of peekFiles.sort()) {
    const rel = `${peekDir}/${f}`;
    const key = `peek:${rel}`;
    units.push({ key, kind: "peek", file: rel, declaration: declare(key, rel) });
  }

  // ── the Detail host binds the port ──
  if (units.some((u) => u.declaration.kind === "host")) {
    const host = read("features/window-panels/detail/DetailHost.tsx") ?? "";
    if (!/\bcustomFields\s*:/.test(host))
      problems.push(
        `features/window-panels/detail/DetailHost.tsx binds no customFields port, so every "record-view: host" surface shows no custom fields.`,
      );
  }

  // ── tables (I2) ──
  const tables: TableUnit[] = [];
  for (const rel of trackedSources(root)) {
    if (rel.includes("__tests__") || /\.test\.tsx?$/.test(rel)) continue;
    if (rel.startsWith("components/official/MatrxDataTable")) continue;
    const text = read(rel);
    if (!text || !/<MatrxDataTable\b/.test(text)) continue;
    if (/\browToken\s*[=:]/.test(text)) tables.push({ file: rel, rowToken: "set" });
    else {
      const none = text.match(ROW_TOKEN_MARKER);
      tables.push(none ? { file: rel, rowToken: "none", reason: none[1].trim() } : { file: rel, rowToken: "pending" });
    }
  }

  // ── the ledger: shrink only ──
  const pendingNow = new Set(units.filter((u) => u.declaration.kind === "pending").map((u) => u.key));
  const ledgerPending = new Set(opts.ledger.pending);
  for (const k of pendingNow)
    if (!ledgerPending.has(k))
      problems.push(
        `${k}: shows no declaration. Add <EntityCustomFields entityToken="…" recordId={…} /> or a "// record-view:" line to its file.`,
      );
  for (const k of ledgerPending)
    if (!pendingNow.has(k)) problems.push(`${k}: is declared now (or gone) — remove it from lib/record-pages/pending.json.`);
  const exempt = units.filter((u) => u.declaration.kind === "none" || u.declaration.kind === "pending").length;
  if (exempt > opts.ledger.exemptCeiling)
    problems.push(
      `Views without a custom-fields section rose to ${exempt} (ceiling ${opts.ledger.exemptCeiling}). A new "record-view: none" page is the cause; declare the record's token instead.`,
    );
  const tablesPendingNow = new Set(tables.filter((t) => t.rowToken === "pending").map((t) => t.file));
  const ledgerTables = new Set(opts.ledger.tablesPending);
  for (const f of tablesPendingNow)
    if (!ledgerTables.has(f))
      problems.push(`${f}: renders <MatrxDataTable> with no rowToken. Set rowToken="<token>" or mark "// row-token: none — <reason>".`);
  for (const f of ledgerTables)
    if (!tablesPendingNow.has(f)) problems.push(`${f}: sets rowToken now (or is gone) — remove it from tablesPending.`);

  const counts: Record<string, number> = {};
  for (const u of units) {
    const k = `${u.kind}.${u.declaration.kind}`;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  if (missing) counts["route.manifestRowWithoutFile"] = missing;
  for (const t of tables) counts[`table.${t.rowToken}`] = (counts[`table.${t.rowToken}`] ?? 0) + 1;
  return { units, tables, problems, noOrganization: [...noOrganization].sort(), counts };
}

/** Every .ts/.tsx under the source roots (not node_modules, not packages' own builds). */
export function trackedSources(root: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const ent of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (ent.name.startsWith(".") || ent.name === "node_modules" || ent.name === "dist") continue;
      const child = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(child);
      else if (/\.tsx?$/.test(ent.name) && !ent.name.endsWith(".d.ts")) out.push(child);
    }
  };
  for (const dir of ["app", "features", "components", "lib", "packages/chat/src"]) if (existsSync(join(root, dir))) walk(dir);
  return out.sort();
}

/** The generated page→token map: what each unit declares, nothing inferred. */
export function toGenerated(c: Census) {
  const records: Record<string, { file: string; tokens?: string[]; host?: true; none?: string; pending?: true }> = {};
  for (const u of c.units) {
    const d = u.declaration;
    records[u.key] =
      d.kind === "tokens"
        ? { file: u.file, tokens: d.tokens }
        : d.kind === "host"
          ? { file: u.file, host: true }
          : d.kind === "none"
            ? { file: u.file, none: d.reason }
            : { file: u.file, pending: true };
  }
  const tokens = [...new Set(c.units.flatMap((u) => (u.declaration.kind === "tokens" ? u.declaration.tokens : [])))].sort();
  return {
    generatedBy: "scripts/record-pages/generate.ts",
    counts: c.counts,
    tokens,
    noOrganization: c.noOrganization,
    records,
    tables: Object.fromEntries(c.tables.map((t) => [t.file, t.rowToken === "none" ? `none — ${t.reason}` : t.rowToken])),
  };
}
