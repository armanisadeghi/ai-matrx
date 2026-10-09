/**
 * DECLARED TYPED TABLES — THE RELEASE CHECK THAT SCREAMS, NEVER BLOCKS.
 *
 * An typed table is a custom table the platform keeps for one of its own features, declared once in
 * code (`defineTypedTable` in `@ai-matrx/records/typed-table`, in a `*.typed-table.ts` file) and copied
 * into each organization on first use (lane PLATFORM-APP-DATA, wave 3 slice 6; design:
 * common-docs projects/data-doctrine-adoption/v6/DESIGN-PLATFORM-APP-DATA-WAVE3.md, REV 2).
 *
 * Arman, 2026-10-02: deleting a table code depends on must "create something that would scream in
 * the app release as well (but never block)". And the size gate (common-docs
 * systems/data/custom-data/DECISIONS.md, last section): "put that starting at 50,000 rows, we
 * have to get a verification from me every 10k rows."
 *
 * For every definition this repo declares (every `*.typed-table.ts`, plus any installed
 * `@ai-matrx/<pkg>/typed-tables` export), ONE read-only query finds every organization's copy (by
 * slug AND kept_for — a person's own table of the same slug never answers) and this prints one
 * loud line per finding:
 *
 *   [WARN] TYPED TABLE MISSING   — a global table with no copy in the platform organization
 *   [WARN] TYPED TABLE ARCHIVED  — organizations whose copy is archived and that have no live one
 *   [WARN] TYPED TABLE UNMARKED  — a live copy without the `code_depends` mark, so the store does not
 *                                guard it against archive / rename / move (lane 12 P5)
 *   [WARN] TYPED TABLE DRIFTED   — a live copy whose columns differ from the definition (aspects named)
 *   [WARN] TYPED TABLE SIZE      — rows across every live copy ≥ 50,000, and every further 10,000
 *                                above the last step Arman acknowledged
 *   [WARN] TYPED TABLE DEFINITION UNREADABLE — a `*.typed-table.ts` this check could not import
 *   [WARN] <slug> graduated to <token> but <org> still has a live copy — a definition declaring
 *                                `graduatedTo` (v7 APPS-ON-DATA item 5) expects every organization's
 *                                copy archived by `pnpm tables:graduate`; archived copies are then
 *                                expected, never an ARCHIVED finding
 *
 * Each finding is also written once to the error monitor (`ops.record_system_error`, kind
 * `typed_table`, error_type = the stable signature `typed_table.<state>.<slug>`); a finding whose
 * signature already has an open row is not written again.
 *
 * THE ACKNOWLEDGEMENT lives on the definition's Table document(s) as
 * `size_ack: { rows, by, on }`, written through the store's own door (`custom.record_update`,
 * which merges the key into the document) on every live copy:
 *
 *   pnpm check:typed-tables --ack <slug> --rows <n> --by "<name>"
 *
 * EXIT CODES (the sibling convention, run-release-gates.sh header): 0 — clean OR findings (advisory,
 * the screaming is the output); 2 — UNMEASURED, the database could not be read (never a quiet
 * green). The release runs the gate runner `--advisory || true`, so nothing here stops a release.
 *
 *   pnpm check:typed-tables                       # live, read-only + error-monitor rows
 *   pnpm check:typed-tables --target clone        # the nightly clone
 *   pnpm check:typed-tables:self-test             # offline: every rule planted, each must go red
 *   pnpm check:typed-tables --self-test --db      # + the real queries on the CLONE, in one rolled-back transaction
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";
import { repoFiles } from "./lib/repo-files";

const GATE = "check:typed-tables";
const REPO_ROOT = resolve(__dirname, "..");

/** Arman, 2026-10-02: the first verification at 50,000 rows, then one every 10,000. */
export const SIZE_FIRST_STEP = 50_000;
export const SIZE_STEP = 10_000;

// ── what a definition looks like to this check ─────────────────────────────────────────────────

/** The fields of an `TypedTableDef` this check reads (the package's own type; read structurally). */
export interface DeclaredField {
  key: string;
  label?: string;
  type: string;
  kind?: string;
  multi?: boolean;
  required?: boolean;
  unique?: boolean;
}
export interface DeclaredTable {
  name: string;
  slug: string;
  scope: "person" | "organization" | "global";
  kept_for: string;
  specs: readonly DeclaredField[];
  /** Where the rows went (`defineTypedTable({ graduatedTo })`); absent or null while not graduated. */
  graduatedTo?: { token: string; map: Readonly<Record<string, string>> } | null;
}
export interface Declaration {
  def: DeclaredTable;
  /** Where it is declared: a repo-relative file, or `@ai-matrx/<pkg>/typed-tables`. */
  declaredIn: string;
}

function looksLikeDefinition(x: unknown): x is DeclaredTable {
  if (!x || typeof x !== "object") return false;
  const d = x as Record<string, unknown>;
  return (
    typeof d.slug === "string" &&
    typeof d.kept_for === "string" &&
    typeof d.name === "string" &&
    typeof d.scope === "string" &&
    Array.isArray(d.specs) &&
    typeof d.specHash === "string"
  );
}

function definitionsIn(mod: Record<string, unknown>): DeclaredTable[] {
  const out: DeclaredTable[] = [];
  for (const value of Object.values(mod)) {
    if (looksLikeDefinition(value)) out.push(value);
    else if (Array.isArray(value)) for (const v of value) if (looksLikeDefinition(v)) out.push(v);
  }
  return out;
}

export interface Unreadable {
  declaredIn: string;
  reason: string;
}

/** Every `*.typed-table.ts` in this checkout, plus installed `@ai-matrx/*` packages' `./typed-tables` exports. */
export async function loadDeclarations(root: string = REPO_ROOT): Promise<{ declarations: Declaration[]; unreadable: Unreadable[] }> {
  const declarations: Declaration[] = [];
  const unreadable: Unreadable[] = [];
  const files = repoFiles(root, { match: /\.typed-table\.ts$/ }).filter((f) => !f.includes("node_modules/"));
  for (const file of files) {
    try {
      const mod = (await import(pathToFileURL(join(root, file)).href)) as Record<string, unknown>;
      const defs = definitionsIn(mod);
      if (defs.length === 0) unreadable.push({ declaredIn: file, reason: "it exports no defineTypedTable(...) definition" });
      for (const def of defs) declarations.push({ def, declaredIn: file });
    } catch (err) {
      unreadable.push({ declaredIn: file, reason: firstLine(err) });
    }
  }
  const scope = join(root, "node_modules", "@ai-matrx");
  if (existsSync(scope)) {
    for (const pkg of readdirSync(scope)) {
      const manifest = join(scope, pkg, "package.json");
      if (!existsSync(manifest)) continue;
      let exportsMap: Record<string, unknown> = {};
      try {
        exportsMap = (JSON.parse(readFileSync(manifest, "utf8")) as { exports?: Record<string, unknown> }).exports ?? {};
      } catch {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(exportsMap, "./typed-tables")) continue;
      const spec = `@ai-matrx/${pkg}/typed-tables`;
      try {
        const mod = (await import(spec)) as Record<string, unknown>;
        for (const def of definitionsIn(mod)) declarations.push({ def, declaredIn: spec });
      } catch (err) {
        unreadable.push({ declaredIn: spec, reason: firstLine(err) });
      }
    }
  }
  return { declarations, unreadable };
}

function firstLine(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split("\n")[0]!.slice(0, 240);
}

// ── what the store holds ───────────────────────────────────────────────────────────────────────

export interface StoredField {
  key: string;
  type: string | null;
  format: string | null;
  label: string | null;
  multi: boolean;
  required: boolean;
  unique: boolean;
}
export interface SizeAck {
  rows: number;
  by: string;
  on: string;
}
/** One organization's copy of one definition. */
export interface Copy {
  slug: string;
  keptFor: string;
  tableId: string;
  organizationId: string;
  archived: boolean;
  /** The document carries `code_depends: true` (the store's archive / rename / move guard holds it). */
  marked: boolean;
  /** Live rows in this copy; `null` for an archived copy. */
  rows: number | null;
  sizeAck: SizeAck | null;
  fields: StoredField[];
}

/**
 * ONE read: every table document (live or archived) whose slug AND kept_for match a declaration,
 * with its stored columns (the same rows `custom.table_ensure` compares against) and its live row
 * count. Read-only by construction; the caller wraps it in BEGIN READ ONLY … ROLLBACK.
 */
export const COPIES_SQL = `
with wanted as (
  select distinct w ->> 'slug' as slug, w ->> 'kept_for' as kept_for
    from jsonb_array_elements($1::jsonb) w
),
t as (
  select r.id, r.organization_id, r.data ->> 'slug' as slug, r.data ->> 'kept_for' as kept_for,
         r.deleted_at is not null as archived, r.data -> 'size_ack' as size_ack,
         r.data @> '{"code_depends": true}'::jsonb as marked
    from custom.record r
    join wanted w on r.data ->> 'slug' = w.slug and nullif(btrim(r.data ->> 'kept_for'), '') = w.kept_for
   where r.table_id = custom.table_kernel_id()
     and r.data_class = 'table'
)
select t.id as table_id, t.organization_id, t.slug, t.kept_for, t.archived, t.size_ack, t.marked,
       case when t.archived then null else
         (select count(*) from custom.record x
           where x.organization_id = t.organization_id and x.table_id = t.id and x.deleted_at is null)
       end as rows,
       case when t.archived then '[]'::jsonb else
         (select coalesce(jsonb_agg(jsonb_build_object(
                   'key', f.data ->> 'key',
                   'type', coalesce(f.data ->> 'parity_type', f.data ->> 'type'),
                   'format', nullif(f.data ->> 'format', ''),
                   'label', f.data ->> 'label',
                   'multi', coalesce((f.data ->> 'multi')::boolean, false),
                   'required', coalesce((f.data ->> 'required')::boolean, false),
                   'unique', exists (select 1 from jsonb_array_elements(coalesce(f.data -> 'rules', '[]'::jsonb)) u
                                      where u ->> 'kind' = 'unique'))), '[]'::jsonb)
            from custom.record f
           where f.organization_id = t.organization_id
             and f.table_id = custom.field_kernel_id()
             and f.data_class = 'field'
             and f.deleted_at is null
             and f.data ->> 'entity_definition_id' = t.id::text
             and not coalesce((f.data ->> 'declared_with_table')::boolean, false))
       end as fields
  from t`;

const SYSTEM_ORG_SQL = `select organization_id::text as id from iam.system_orgs where key = 'system'`;

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

function asAck(v: unknown): SizeAck | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  const rows = typeof a.rows === "number" ? a.rows : Number(a.rows);
  if (!Number.isFinite(rows) || rows <= 0) return null;
  return { rows, by: String(a.by ?? ""), on: String(a.on ?? "") };
}

export async function readCopies(db: Queryable, declarations: readonly Declaration[]): Promise<Copy[]> {
  if (declarations.length === 0) return [];
  const wanted = declarations.map((d) => ({ slug: d.def.slug, kept_for: d.def.kept_for }));
  const { rows } = await db.query(COPIES_SQL, [JSON.stringify(wanted)]);
  return rows.map((r) => ({
    slug: String(r.slug),
    keptFor: String(r.kept_for),
    tableId: String(r.table_id),
    organizationId: String(r.organization_id),
    archived: r.archived === true,
    marked: r.marked === true,
    rows: r.rows === null || r.rows === undefined ? null : Number(r.rows),
    sizeAck: asAck(r.size_ack),
    fields: (Array.isArray(r.fields) ? r.fields : []) as StoredField[],
  }));
}

export async function readSystemOrg(db: Queryable): Promise<string | null> {
  const { rows } = await db.query(SYSTEM_ORG_SQL);
  return rows[0] ? String(rows[0].id) : null;
}

// ── the judgement (pure) ───────────────────────────────────────────────────────────────────────

/**
 * The store's stored shape for each word a definition sends — `coalesce(parity_type, type)` and
 * `format`. MIRRORS `storedShapeOf` in aidream apps/shared/records/src/typed-table/check.ts (not
 * exported by the package); re-measured on the clone 2026-10-02 by `--self-test --db` (text,
 * datetime, select and number columns made by custom.table_ensure must judge clean).
 */
export function storedShapeOf(word: string, kind: unknown): { type: string; format: string | null } {
  switch (word) {
    case "text":
      return { type: "text", format: null };
    case "long_text":
      return { type: "text", format: "long" };
    case "email":
    case "phone":
    case "url":
    case "currency":
    case "percent":
      return { type: word, format: word };
    case "number":
    case "integer":
    case "decimal":
      return { type: "range", format: null };
    case "datetime":
      return { type: "datetime", format: kind === "date" ? null : "datetime" };
    case "entity_reference":
      return { type: "relation", format: null };
    case "autonumber":
    case "created_time":
    case "modified_time":
    case "formula":
      return { type: "formula", format: null };
    default:
      return { type: word, format: null };
  }
}

export interface Drift {
  field: string;
  aspect: "spec" | "type" | "format" | "label" | "multi" | "required" | "unique" | "extra";
  stored: string | boolean | null;
  declared: string | boolean | null;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function driftOf(def: DeclaredTable, stored: readonly StoredField[]): Drift[] {
  const byKey = new Map(stored.map((s) => [s.key, s]));
  const drift: Drift[] = [];
  for (const spec of def.specs) {
    const s = byKey.get(spec.key);
    if (!s) {
      drift.push({ field: spec.key, aspect: "spec", stored: null, declared: spec.type });
      continue;
    }
    const want = storedShapeOf(spec.type, spec.kind);
    const pairs: Array<[Drift["aspect"], string | boolean | null, string | boolean | null]> = [
      ["type", text(s.type), want.type],
      ["format", text(s.format), want.format],
      ["label", text(s.label), text(spec.label)],
      ["multi", s.multi === true, spec.multi === true],
      ["required", s.required === true, spec.required === true],
      ["unique", s.unique === true, spec.unique === true],
    ];
    for (const [aspect, storedValue, declared] of pairs) {
      if (storedValue !== declared) drift.push({ field: spec.key, aspect, stored: storedValue, declared });
    }
  }
  const declared = new Set(def.specs.map((s) => s.key));
  for (const s of stored) {
    if (!s.key || declared.has(s.key)) continue;
    drift.push({ field: s.key, aspect: "extra", stored: text(s.type), declared: null });
  }
  return drift;
}

/** The next size at which Arman's verification is asked for, given the last acknowledged rows. */
export function nextSizeStep(ackRows: number | null): number {
  if (ackRows === null || ackRows < SIZE_FIRST_STEP) return SIZE_FIRST_STEP;
  return Math.floor(ackRows / SIZE_STEP) * SIZE_STEP + SIZE_STEP;
}

export type FindingState = "missing" | "archived" | "unmarked" | "drifted" | "size" | "unreadable" | "graduated";
export interface Finding {
  state: FindingState;
  slug: string;
  signature: string;
  line: string;
  detail: Record<string, unknown>;
}

const n = (x: number) => x.toLocaleString("en-US");
const orgs = (k: number) => `${k} organization${k === 1 ? "" : "s"}`;

function describeDrift(d: Drift): string {
  const v = (x: string | boolean | null) => (x === null ? "none" : String(x));
  if (d.aspect === "spec") return `${d.field} missing (declared ${v(d.declared)})`;
  if (d.aspect === "extra") return `${d.field} not declared (stored ${v(d.stored)})`;
  return `${d.field} ${d.aspect} (stored ${v(d.stored)}, declared ${v(d.declared)})`;
}

/**
 * Every finding for these declarations over these copies. Pure: the same input, the same lines.
 * `systemOrgId` is the platform organization (where a global table's one copy lives); `null` when
 * the caller only judges per-organization copies.
 */
export function judge(declarations: readonly Declaration[], copies: readonly Copy[], systemOrgId: string | null): Finding[] {
  const findings: Finding[] = [];
  for (const { def, declaredIn } of declarations) {
    const mine = copies.filter((c) => c.slug === def.slug && c.keptFor === def.kept_for);
    const live = mine.filter((c) => !c.archived);
    const liveOrgs = new Set(live.map((c) => c.organizationId));
    const where = `declared in ${declaredIn}`;

    // GRADUATED: the rows live in the entity table now; every copy is expected archived, and only
    // a live one is said — one line per organization. Nothing else is judged for a graduated table.
    if (def.graduatedTo) {
      for (const org of [...liveOrgs]) {
        findings.push({
          state: "graduated",
          slug: def.slug,
          signature: `typed_table.graduated.${def.slug}.${org}`,
          line: `[WARN] ${def.slug} graduated to ${def.graduatedTo.token} but ${org} still has a live copy — run pnpm tables:graduate (records package) — ${where}`,
          detail: { declared_in: declaredIn, graduated_to: def.graduatedTo.token, organization_id: org },
        });
      }
      continue;
    }

    if (def.scope === "global" && systemOrgId !== null && !mine.some((c) => c.organizationId === systemOrgId)) {
      findings.push({
        state: "missing",
        slug: def.slug,
        signature: `typed_table.missing.${def.slug}`,
        line: `[WARN] TYPED TABLE MISSING ${def.slug} — global, no copy in the platform organization — ${where} — run the server path that ensures it once`,
        detail: { declared_in: declaredIn, scope: def.scope },
      });
    }

    const archivedOrgs = [...new Set(mine.filter((c) => c.archived && !liveOrgs.has(c.organizationId)).map((c) => c.organizationId))];
    if (archivedOrgs.length > 0) {
      findings.push({
        state: "archived",
        slug: def.slug,
        signature: `typed_table.archived.${def.slug}`,
        line: `[WARN] TYPED TABLE ARCHIVED ${def.slug} — ${orgs(archivedOrgs.length)} — ${where} — restore it from Archived tables`,
        detail: { declared_in: declaredIn, organization_ids: archivedOrgs },
      });
    }

    const unmarkedOrgs = [...new Set(live.filter((c) => !c.marked).map((c) => c.organizationId))];
    if (unmarkedOrgs.length > 0) {
      findings.push({
        state: "unmarked",
        slug: def.slug,
        signature: `typed_table.unmarked.${def.slug}`,
        line: `[WARN] TYPED TABLE UNMARKED ${def.slug} — ${orgs(unmarkedOrgs.length)} — ${where} — not guarded against archive, rename or move until its next ensure marks it`,
        detail: { declared_in: declaredIn, organization_ids: unmarkedOrgs },
      });
    }

    const driftByOrg = live.map((c) => ({ org: c.organizationId, drift: driftOf(def, c.fields) })).filter((x) => x.drift.length > 0);
    if (driftByOrg.length > 0) {
      const aspects: string[] = [];
      for (const { drift } of driftByOrg) for (const d of drift) {
        const said = describeDrift(d);
        if (!aspects.includes(said)) aspects.push(said);
      }
      findings.push({
        state: "drifted",
        slug: def.slug,
        signature: `typed_table.drifted.${def.slug}`,
        line:
          `[WARN] TYPED TABLE DRIFTED ${def.slug} — ${orgs(new Set(driftByOrg.map((x) => x.org)).size)} — ${aspects.join("; ")} — ${where}` +
          ` — change the definition back, or bring the stored columns in line with it`,
        detail: { declared_in: declaredIn, drift: driftByOrg },
      });
    }

    const total = live.reduce((sum, c) => sum + (c.rows ?? 0), 0);
    const ack = mine.reduce<SizeAck | null>((best, c) => (c.sizeAck && (!best || c.sizeAck.rows > best.rows) ? c.sizeAck : best), null);
    const step = nextSizeStep(ack?.rows ?? null);
    if (total >= step) {
      const passed = Math.max(SIZE_FIRST_STEP, Math.floor(total / SIZE_STEP) * SIZE_STEP);
      findings.push({
        state: "size",
        slug: def.slug,
        signature: `typed_table.size.${def.slug}`,
        line:
          `[WARN] TYPED TABLE SIZE ${def.slug} — ${n(total)} rows across ${orgs(liveOrgs.size)} — passed ${n(passed)}; ` +
          `last acknowledged: ${ack ? `${n(ack.rows)} by ${ack.by} on ${ack.on}` : "never"} — ` +
          `Arman's verification needed: pnpm check:typed-tables --ack ${def.slug} --rows ${total} --by "Arman" — ${where}`,
        detail: { declared_in: declaredIn, rows: total, step: passed, acknowledged: ack },
      });
    }
  }
  return findings;
}

export function unreadableFindings(unreadable: readonly Unreadable[]): Finding[] {
  return unreadable.map((u) => ({
    state: "unreadable" as const,
    slug: u.declaredIn,
    signature: `typed_table.unreadable.${u.declaredIn}`,
    line: `[WARN] TYPED TABLE DEFINITION UNREADABLE ${u.declaredIn} — ${u.reason} — this check could not see what it declares`,
    detail: { declared_in: u.declaredIn, reason: u.reason },
  }));
}

// ── the error monitor ─────────────────────────────────────────────────────────────────────────

const OPEN_SIGNATURES_SQL = `
select distinct error_type from ops.system_error
 where kind = 'typed_table' and resolved_at is null and error_type = any($1::text[])`;
const RECORD_SQL = `select ops.record_system_error($1::jsonb)::text as id`;

/**
 * One `ops.record_system_error` per finding whose signature has no open row yet. The caller owns the
 * transaction (commit on a real run; the DB self-test rolls back).
 */
export async function recordFindings(db: Queryable, findings: readonly Finding[]): Promise<{ written: string[]; alreadyOpen: string[] }> {
  if (findings.length === 0) return { written: [], alreadyOpen: [] };
  const signatures = [...new Set(findings.map((f) => f.signature))];
  const open = new Set((await db.query(OPEN_SIGNATURES_SQL, [signatures])).rows.map((r) => String(r.error_type)));
  const written: string[] = [];
  const alreadyOpen: string[] = [];
  const seen = new Set<string>();
  for (const f of findings) {
    if (seen.has(f.signature)) continue;
    seen.add(f.signature);
    if (open.has(f.signature)) {
      alreadyOpen.push(f.signature);
      continue;
    }
    await db.query(RECORD_SQL, [
      JSON.stringify({
        kind: "typed_table",
        source_app: "matrx-frontend",
        source_feature: "typed-tables",
        route: "scripts/check-typed-tables.ts",
        error_type: f.signature,
        error_text: f.line.replace(/^\[WARN\] /, ""),
        metadata: { signature: f.signature, state: f.state, slug: f.slug, ...f.detail },
      }),
    ]);
    written.push(f.signature);
  }
  return { written, alreadyOpen };
}

// ── the acknowledgement ───────────────────────────────────────────────────────────────────────

const ACK_SQL = `select custom.record_update($1::uuid, $2::uuid, jsonb_build_object('size_ack', $3::jsonb), null) as version`;

export async function writeAck(db: Queryable, copies: readonly Copy[], ack: SizeAck): Promise<number> {
  await db.query(`select set_config('app.actor_system', '${GATE}', true)`);
  let written = 0;
  for (const c of copies) {
    if (c.archived) continue;
    await db.query(ACK_SQL, [c.organizationId, c.tableId, JSON.stringify(ack)]);
    written += 1;
  }
  return written;
}

// ── self-test ─────────────────────────────────────────────────────────────────────────────────

// Use case: Cedar Ridge Physical Therapy's front desk keeps a callback list (one copy per
// organization), and the platform keeps one exercise library (global). Each case plants ONE
// state and requires exactly that finding — a judge that returns nothing, or always the same
// thing, fails more than one case.

const ORG = {
  cedarRidge: "0a54df90-eab8-4d07-ab29-81a45fb41e04",
  harborDental: "5b1c2a7e-3f44-4d0b-9a61-2c8e7f1d9b30",
  northsideRecycling: "7d2e9c14-8a5b-4f3e-b6d2-41a9e0c7f582",
  lakeviewProperty: "93f0b6a2-1c7d-4e58-a2b9-6d4e8f0c1a73",
  platform: "39c38960-d30c-4840-b0c1-c9960de95582",
} as const;

const CALLBACKS: DeclaredTable & { specHash: string } = {
  name: "Patient callbacks",
  slug: "patient_callbacks",
  scope: "organization",
  kept_for: "frontdesk",
  specHash: "fixture",
  specs: [
    { key: "patient_name", label: "Patient", type: "text", required: true, unique: true },
    { key: "callback_at", label: "Call back at", type: "datetime", kind: "datetime" },
    { key: "reason", label: "Reason", type: "select" },
    { key: "visits_left", label: "Visits left", type: "number" },
  ],
};
const LIBRARY: DeclaredTable & { specHash: string } = {
  name: "Exercise library",
  slug: "exercise_library",
  scope: "global",
  kept_for: "exercises",
  specHash: "fixture",
  specs: [{ key: "exercise", label: "Exercise", type: "text", required: true, unique: true }],
};
const CALLBACKS_DECL: Declaration = { def: CALLBACKS, declaredIn: "features/front-desk/patient-callbacks.typed-table.ts" };
const LIBRARY_DECL: Declaration = { def: LIBRARY, declaredIn: "features/exercises/exercise-library.typed-table.ts" };
/** The callbacks feature caught on and graduated to a standard entity table. */
const GRADUATED: DeclaredTable & { specHash: string } = {
  ...CALLBACKS,
  graduatedTo: { token: "frontdesk.patient_callback", map: { patient_name: "patient_name", callback_at: "callback_at", reason: "reason", visits_left: "custom_fields" } },
};
const GRADUATED_DECL: Declaration = { def: GRADUATED, declaredIn: CALLBACKS_DECL.declaredIn };

/** What custom.table_ensure stores for CALLBACKS (measured on the clone 2026-10-02). */
const CALLBACK_COLUMNS: StoredField[] = [
  { key: "patient_name", type: "text", format: null, label: "Patient", multi: false, required: true, unique: true },
  { key: "callback_at", type: "datetime", format: "datetime", label: "Call back at", multi: false, required: false, unique: false },
  { key: "reason", type: "select", format: null, label: "Reason", multi: false, required: false, unique: false },
  { key: "visits_left", type: "range", format: null, label: "Visits left", multi: false, required: false, unique: false },
];
const LIBRARY_COLUMNS: StoredField[] = [
  { key: "exercise", type: "text", format: null, label: "Exercise", multi: false, required: true, unique: true },
];

let tableSeq = 0;
function copy(def: DeclaredTable, org: string, over: Partial<Copy> = {}): Copy {
  tableSeq += 1;
  return {
    slug: def.slug,
    keptFor: def.kept_for,
    tableId: `00000000-0000-4000-8000-${String(tableSeq).padStart(12, "0")}`,
    organizationId: org,
    archived: false,
    marked: true,
    rows: 12,
    sizeAck: null,
    fields: def === LIBRARY ? LIBRARY_COLUMNS : CALLBACK_COLUMNS,
    ...over,
  };
}

interface Case {
  name: string;
  /** Default: the callbacks and library declarations. */
  declarations?: Declaration[];
  copies: Copy[];
  /** The exact states expected, in order. */
  states: FindingState[];
  /** Every pattern must appear in the finding lines. */
  lines?: RegExp[];
}

function offlineCases(): Case[] {
  const healthyLibrary = copy(LIBRARY, ORG.platform, { rows: 40 });
  return [
    { name: "clean: a live, matching copy in every place it should be", copies: [copy(CALLBACKS, ORG.cedarRidge, { rows: 120 }), healthyLibrary], states: [] },
    {
      name: "ARCHIVED: two organizations' copies archived (a third archived one has a live copy beside it)",
      copies: [
        copy(CALLBACKS, ORG.cedarRidge),
        copy(CALLBACKS, ORG.harborDental, { archived: true, rows: null, fields: [] }),
        copy(CALLBACKS, ORG.harborDental),
        copy(CALLBACKS, ORG.northsideRecycling, { archived: true, rows: null, fields: [] }),
        copy(CALLBACKS, ORG.lakeviewProperty, { archived: true, rows: null, fields: [] }),
        healthyLibrary,
      ],
      states: ["archived"],
      lines: [/^\[WARN\] TYPED TABLE ARCHIVED patient_callbacks — 2 organizations — declared in features\/front-desk\/patient-callbacks\.typed-table\.ts — restore it from Archived tables$/],
    },
    {
      name: "UNMARKED: a live copy without the code-depends mark (an archived unmarked copy is ARCHIVED only)",
      copies: [
        copy(CALLBACKS, ORG.cedarRidge),
        copy(CALLBACKS, ORG.harborDental, { marked: false }),
        copy(CALLBACKS, ORG.northsideRecycling, { archived: true, marked: false, rows: null, fields: [] }),
        healthyLibrary,
      ],
      states: ["archived", "unmarked"],
      lines: [/^\[WARN\] TYPED TABLE UNMARKED patient_callbacks — 1 organization — declared in features\/front-desk\/patient-callbacks\.typed-table\.ts — not guarded/],
    },
    {
      name: "DRIFTED: a field's stored type differs from the definition",
      copies: [
        copy(CALLBACKS, ORG.cedarRidge, {
          fields: CALLBACK_COLUMNS.map((c) => (c.key === "callback_at" ? { ...c, type: "text", format: null } : c)),
        }),
        copy(CALLBACKS, ORG.harborDental),
        healthyLibrary,
      ],
      states: ["drifted"],
      lines: [/^\[WARN\] TYPED TABLE DRIFTED patient_callbacks — 1 organization — callback_at type \(stored text, declared datetime\); callback_at format \(stored none, declared datetime\) — declared in /],
    },
    {
      name: "DRIFTED: a declared column missing and an undeclared one present",
      copies: [
        copy(CALLBACKS, ORG.northsideRecycling, {
          fields: [
            ...CALLBACK_COLUMNS.filter((c) => c.key !== "visits_left"),
            { key: "insurer", type: "text", format: null, label: "Insurer", multi: false, required: false, unique: false },
          ],
        }),
        healthyLibrary,
      ],
      states: ["drifted"],
      lines: [/visits_left missing \(declared number\)/, /insurer not declared \(stored text\)/],
    },
    {
      name: "MISSING: a global table with no copy in the platform organization (a per-org table with no copy is not missing)",
      copies: [copy(LIBRARY, ORG.cedarRidge, { rows: 3 })],
      states: ["missing"],
      lines: [/^\[WARN\] TYPED TABLE MISSING exercise_library — global, no copy in the platform organization — declared in features\/exercises\/exercise-library\.typed-table\.ts/],
    },
    {
      name: "MISSING: a global table archived in the platform organization is ARCHIVED, not missing",
      copies: [copy(CALLBACKS, ORG.cedarRidge), copy(LIBRARY, ORG.platform, { archived: true, rows: null, fields: [] })],
      states: ["archived"],
      lines: [/TYPED TABLE ARCHIVED exercise_library — 1 organization/],
    },
    {
      name: "SIZE: 50,001 rows across two organizations (stubbed counts)",
      copies: [copy(CALLBACKS, ORG.cedarRidge, { rows: 30_000 }), copy(CALLBACKS, ORG.harborDental, { rows: 20_001 }), healthyLibrary],
      states: ["size"],
      lines: [/^\[WARN\] TYPED TABLE SIZE patient_callbacks — 50,001 rows across 2 organizations — passed 50,000; last acknowledged: never — Arman's verification needed: pnpm check:typed-tables --ack patient_callbacks --rows 50001 --by "Arman"/],
    },
    {
      name: "SIZE: 49,999 rows stays silent; archived copies' rows never count",
      copies: [
        copy(CALLBACKS, ORG.cedarRidge, { rows: 29_999 }),
        copy(CALLBACKS, ORG.harborDental, { rows: 20_000 }),
        copy(CALLBACKS, ORG.northsideRecycling, { archived: true, rows: 9_000, fields: [] }),
        copy(CALLBACKS, ORG.northsideRecycling, { rows: 0 }),
        healthyLibrary,
      ],
      states: [],
    },
    {
      name: "ACK at 50,000: 59,999 rows stays silent",
      copies: [copy(CALLBACKS, ORG.cedarRidge, { rows: 59_999, sizeAck: { rows: 50_000, by: "Arman", on: "2026-10-02" } }), healthyLibrary],
      states: [],
    },
    {
      name: "ACK at 50,000: 60,000 rows asks again, naming the acknowledgement",
      copies: [
        copy(CALLBACKS, ORG.cedarRidge, { rows: 35_000, sizeAck: { rows: 50_000, by: "Arman", on: "2026-10-02" } }),
        copy(CALLBACKS, ORG.lakeviewProperty, { rows: 25_000 }),
        healthyLibrary,
      ],
      states: ["size"],
      lines: [/60,000 rows across 2 organizations — passed 60,000; last acknowledged: 50,000 by Arman on 2026-10-02/],
    },
    {
      name: "GRADUATED: every organization's copy archived stays silent (archived is expected, never ARCHIVED)",
      declarations: [GRADUATED_DECL, LIBRARY_DECL],
      copies: [
        copy(GRADUATED, ORG.cedarRidge, { archived: true, rows: null, fields: [] }),
        copy(GRADUATED, ORG.harborDental, { archived: true, rows: null, fields: [] }),
        healthyLibrary,
      ],
      states: [],
    },
    {
      name: "GRADUATED: a live copy left behind is said by organization, and only that",
      declarations: [GRADUATED_DECL, LIBRARY_DECL],
      copies: [
        copy(GRADUATED, ORG.cedarRidge, { archived: true, rows: null, fields: [] }),
        copy(GRADUATED, ORG.harborDental, { rows: 60_000, marked: false }),
        healthyLibrary,
      ],
      states: ["graduated"],
      lines: [new RegExp(`^\\[WARN\\] patient_callbacks graduated to frontdesk\\.patient_callback but ${ORG.harborDental} still has a live copy`)],
    },
    {
      name: "ACK at 60,000: 60,500 rows stays silent",
      copies: [copy(CALLBACKS, ORG.cedarRidge, { rows: 60_500, sizeAck: { rows: 60_000, by: "Arman", on: "2026-10-09" } }), healthyLibrary],
      states: [],
    },
  ];
}

class FakeDb implements Queryable {
  readonly recorded: Array<Record<string, unknown>> = [];
  constructor(private readonly open: string[]) {}
  async query(sql: string, params: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> {
    if (sql === OPEN_SIGNATURES_SQL) {
      const asked = params[0] as string[];
      return { rows: this.open.filter((s) => asked.includes(s)).map((error_type) => ({ error_type })) };
    }
    if (sql === RECORD_SQL) {
      this.recorded.push(JSON.parse(String(params[0])) as Record<string, unknown>);
      return { rows: [{ id: "recorded" }] };
    }
    throw new Error(`FakeDb: unexpected statement ${sql.slice(0, 60)}`);
  }
}

async function offlineSelfTest(): Promise<number> {
  let failed = 0;
  const declarations = [CALLBACKS_DECL, LIBRARY_DECL];
  for (const c of offlineCases()) {
    const findings = judge(c.declarations ?? declarations, c.copies, ORG.platform);
    const states = findings.map((f) => f.state);
    const lines = findings.map((f) => f.line);
    const statesOk = JSON.stringify(states) === JSON.stringify(c.states);
    const missing = (c.lines ?? []).filter((re) => !lines.some((l) => re.test(l)));
    if (statesOk && missing.length === 0) {
      console.log(`[ OK ] ${c.name}`);
    } else {
      failed += 1;
      console.log(`[FAIL] ${c.name}`);
      console.log(`       expected states [${c.states.join(", ")}], got [${states.join(", ")}]`);
      for (const re of missing) console.log(`       no line matched ${re}`);
      for (const l of lines) console.log(`       line: ${l}`);
    }
  }

  // The glob: a `*.typed-table.ts` anywhere in the checkout is found and imported; one that cannot be
  // imported is reported by name, never skipped.
  const dir = mkdtempSync(join(tmpdir(), "check-typed-tables-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    mkdirSync(join(dir, "features", "front-desk"), { recursive: true });
    mkdirSync(join(dir, "features", "intake"), { recursive: true });
    writeFileSync(
      join(dir, "features", "front-desk", "patient-callbacks.typed-table.ts"),
      `export const patientCallbacks = ${JSON.stringify(CALLBACKS)};\nexport const notATable = { slug: "x" };\n`,
    );
    writeFileSync(
      join(dir, "features", "intake", "new-patient-intake.typed-table.ts"),
      `import { defineTypedTable } from "@ai-matrx/records-not-installed/typed-table";\nexport const intake = defineTypedTable({});\n`,
    );
    writeFileSync(join(dir, "features", "front-desk", "callbacks.ts"), `export const patientCallbacks = ${JSON.stringify(CALLBACKS)};\n`);
    const loaded = await loadDeclarations(dir);
    const got = loaded.declarations.map((d) => `${d.def.slug}@${d.declaredIn}`);
    const bad = loaded.unreadable.map((u) => u.declaredIn);
    if (
      JSON.stringify(got) === JSON.stringify(["patient_callbacks@features/front-desk/patient-callbacks.typed-table.ts"]) &&
      JSON.stringify(bad) === JSON.stringify(["features/intake/new-patient-intake.typed-table.ts"])
    ) {
      console.log("[ OK ] glob: every *.typed-table.ts is imported; an unimportable one is named, a plain .ts is not read");
    } else {
      failed += 1;
      console.log(`[FAIL] glob: found [${got.join(", ")}], unreadable [${bad.join(", ")}]`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // The error monitor: one row per finding, signature typed_table.<state>.<slug>, none for an open one.
  const findings = judge(
    [CALLBACKS_DECL, LIBRARY_DECL],
    [
      copy(CALLBACKS, ORG.northsideRecycling, { archived: true, rows: null, fields: [] }),
      copy(CALLBACKS, ORG.cedarRidge, { rows: 51_200 }),
      copy(LIBRARY, ORG.cedarRidge),
    ],
    ORG.platform,
  );
  const fresh = new FakeDb([]);
  await recordFindings(fresh, findings);
  const wrote = fresh.recorded.map((r) => r.error_type).sort();
  const wantAll = ["typed_table.archived.patient_callbacks", "typed_table.missing.exercise_library", "typed_table.size.patient_callbacks"];
  const kindsOk = fresh.recorded.every((r) => r.kind === "typed_table" && (r.metadata as Record<string, unknown>)?.signature === r.error_type);
  if (JSON.stringify(wrote) === JSON.stringify(wantAll) && kindsOk) console.log("[ OK ] error monitor: one typed_table row per finding, keyed by its signature");
  else {
    failed += 1;
    console.log(`[FAIL] error monitor: expected ${wantAll.join(", ")}; wrote ${wrote.join(", ") || "nothing"}${kindsOk ? "" : " (kind/metadata wrong)"}`);
  }
  const reopened = new FakeDb(["typed_table.archived.patient_callbacks"]);
  await recordFindings(reopened, findings);
  const wrote2 = reopened.recorded.map((r) => r.error_type).sort();
  const want2 = ["typed_table.missing.exercise_library", "typed_table.size.patient_callbacks"];
  if (JSON.stringify(wrote2) === JSON.stringify(want2)) console.log("[ OK ] error monitor: a finding with an open row is not written again");
  else {
    failed += 1;
    console.log(`[FAIL] error monitor dedupe: expected ${want2.join(", ")}; wrote ${wrote2.join(", ") || "nothing"}`);
  }
  return failed;
}

/** `custom.table_ensure`'s spec for a definition — the shape `ensureTypedTable` sends (records declareTable.ts). */
function ensureSpec(def: DeclaredTable): Record<string, unknown> {
  const title = def.specs[0]!.key;
  return {
    name: def.name,
    slug: def.slug,
    type: "entity",
    label_singular: def.name,
    label_plural: def.name,
    display: "list",
    weight: "light",
    ordered: false,
    row_order: "manual",
    title_field: title,
    retention_days: 365,
    agent_writable: true,
    default_sort: [{ field: title, direction: "asc" }],
    kept_by_the_app: true,
    kept_for: def.kept_for,
    code_depends: true,
    app_table: { scope: def.scope, spec_hash: "self-test" },
    fields: def.specs.map((s, i) => ({
      key: s.key,
      label: s.label,
      type: s.type,
      sort: (i + 1) * 10,
      required: s.required === true,
      multi: s.multi === true,
      ...(s.kind ? { kind: s.kind } : {}),
      ...(s.type === "select" ? { options: ["Reschedule", "Billing question", "Exercise plan"] } : {}),
      ...(s.unique ? { rules: [{ kind: "unique" }] } : {}),
    })),
  };
}

/**
 * THE REAL QUERIES, ON THE CLONE, IN ONE ROLLED-BACK TRANSACTION: make Cedar Ridge's copy through
 * custom.table_ensure, require it to judge clean (the shape map matches the store), change a field
 * type in the definition and require DRIFTED, archive the copy through custom.table_archive_deliberately and
 * require ARCHIVED, record it and read the error row back. Nothing is committed.
 */
async function dbSelfTest(argv: string[]): Promise<number> {
  const { openCheckDb } = await import("./lib/check-target");
  const checkDb = await openCheckDb({ gate: GATE, defaultTarget: "clone", argv });
  if (checkDb.target !== "clone") {
    await checkDb.client.end().catch(() => undefined);
    console.log("[FAIL] --self-test --db plants a table and runs only on the clone. Nothing was done.");
    return 1;
  }
  const db = checkDb.client as unknown as Queryable & { end: () => Promise<void> };
  const decl = CALLBACKS_DECL;
  const retyped: Declaration = {
    def: { ...CALLBACKS, specs: CALLBACKS.specs.map((s) => (s.key === "callback_at" ? { ...s, type: "text", kind: undefined } : s)) },
    declaredIn: decl.declaredIn,
  };
  let failed = 0;
  const expect = (ok: boolean, name: string, detail: string) => {
    if (ok) console.log(`[ OK ] clone: ${name}`);
    else {
      failed += 1;
      console.log(`[FAIL] clone: ${name} — ${detail}`);
    }
  };
  try {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await db.query("begin");
        await db.query(`select set_config('app.actor_system', '${GATE}', true)`);
        const ensured = (await db.query(`select custom.table_ensure($1::uuid, $2::jsonb) as r`, [ORG.cedarRidge, JSON.stringify(ensureSpec(CALLBACKS))]))
          .rows[0]!.r as { table_id: string };
        const own = (cs: Copy[]) => cs.filter((c) => c.organizationId === ORG.cedarRidge);
        const live = own(await readCopies(db, [decl]));
        const clean = judge([decl], live, null);
        expect(live.length === 1 && !live[0]!.archived && clean.length === 0, "a fresh copy made by custom.table_ensure judges clean",
          `copies ${live.length}, findings: ${clean.map((f) => f.line).join(" | ") || "none"}`);
        const drifted = judge([retyped], live, null);
        expect(drifted.length === 1 && drifted[0]!.state === "drifted" && /callback_at type \(stored datetime, declared text\)/.test(drifted[0]!.line),
          "changing callback_at's type in the definition → DRIFTED", drifted.map((f) => f.line).join(" | ") || "no finding");
        // The copy is marked `code_depends` (lane 12 P5): only the deliberate door archives it.
        await db.query(`select custom.table_archive_deliberately($1::uuid, $2::uuid, $3, 'check:typed-tables self-test')`, [ORG.cedarRidge, ensured.table_id, CALLBACKS.slug]);
        const after = own(await readCopies(db, [decl]));
        const archived = judge([decl], after, null);
        expect(archived.length === 1 && archived[0]!.state === "archived" && /TYPED TABLE ARCHIVED patient_callbacks — 1 organization/.test(archived[0]!.line),
          "archiving the copy through custom.table_archive_deliberately → ARCHIVED line", archived.map((f) => f.line).join(" | ") || "no finding");
        await recordFindings(db, archived);
        const row = (await db.query(
          `select count(*)::int as n from ops.system_error where kind = 'typed_table' and error_type = 'typed_table.archived.patient_callbacks' and resolved_at is null`,
        )).rows[0]!.n as number;
        expect(row >= 1, "the ARCHIVED finding is in ops.system_error under typed_table.archived.patient_callbacks", `rows: ${row}`);
        await db.query("rollback");
        break;
      } catch (err) {
        await db.query("rollback").catch(() => undefined);
        const code = (err as { code?: string }).code;
        if (code === "55P03" && attempt < 4) {
          console.log(`  (lock wait on the clone — attempt ${attempt} rolled back, retrying)`);
          continue;
        }
        throw err;
      }
    }
  } finally {
    await db.end().catch(() => undefined);
  }
  return failed;
}

async function selfTest(argv: string[]): Promise<number> {
  let failed = await offlineSelfTest();
  if (argv.includes("--db")) failed += await dbSelfTest(argv);
  if (failed > 0) {
    console.log(`\n[FAIL] check:typed-tables self-test — ${failed} planted state(s) were not caught. The detector is broken.`);
    return 1;
  }
  console.log(`\n✓ check:typed-tables self-test — every planted state caught, and the clean fixtures stay silent.`);
  return 0;
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────

function argValue(argv: readonly string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i >= 0) return argv[i + 1] ?? null;
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : null;
}

function unmeasured(reason: string): number {
  console.log("");
  console.log(`[WARN] TYPED TABLES UNMEASURED — ${reason}`);
  console.log("  Nothing about the declared typed tables was checked: missing, archived, drifted and size are all unknown.");
  console.log("");
  return 2;
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--self-test")) return selfTest(argv);

  const { declarations, unreadable } = await loadDeclarations();
  const ackSlug = argValue(argv, "--ack");

  const { openCheckDb } = await import("./lib/check-target");
  let checkDb: Awaited<ReturnType<typeof openCheckDb>>;
  try {
    checkDb = await openCheckDb({ gate: GATE, defaultTarget: "production", argv });
  } catch (err) {
    for (const f of unreadableFindings(unreadable)) console.log(f.line);
    return unmeasured(`the database could not be opened — ${firstLine(err)}`);
  }
  const client = checkDb.client as unknown as Queryable & { end: () => Promise<void> };

  try {
    if (ackSlug) return await ack(client, declarations, ackSlug, argv);

    let copies: Copy[];
    let systemOrg: string | null;
    try {
      await client.query("begin read only");
      try {
        copies = await readCopies(client, declarations);
        systemOrg = await readSystemOrg(client);
      } finally {
        await client.query("rollback");
      }
    } catch (err) {
      for (const f of unreadableFindings(unreadable)) console.log(f.line);
      return unmeasured(`the store could not be read — ${firstLine(err)}`);
    }

    const findings = [...unreadableFindings(unreadable), ...judge(declarations, copies, systemOrg)];
    console.log(
      `TYPED TABLES — ${declarations.length} declared (${new Set(declarations.map((d) => d.declaredIn)).size} file(s)), ` +
        `${copies.length} organization cop${copies.length === 1 ? "y" : "ies"} found.`,
    );
    for (const d of declarations) {
      if (d.def.scope !== "global" && !copies.some((c) => c.slug === d.def.slug && c.keptFor === d.def.kept_for)) {
        console.log(`  ${d.def.slug} — no organization has used it yet (declared in ${d.declaredIn})`);
      }
    }
    if (findings.length === 0) {
      console.log("✓ every declared typed table is present, live, matches its definition and is under its size step.");
      return 0;
    }
    console.log("");
    for (const f of findings) console.log(f.line);
    console.log("");
    try {
      await client.query("begin");
      const { written, alreadyOpen } = await recordFindings(client, findings);
      await client.query("commit");
      console.log(
        `  error monitor: ${written.length} new row(s) (kind typed_table)` +
          (alreadyOpen.length ? `, ${alreadyOpen.length} already open` : "") + ".",
      );
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      console.log(`[WARN] TYPED TABLE FINDINGS NOT RECORDED in the error monitor — ${firstLine(err)}`);
    }
    return 0;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function ack(client: Queryable, declarations: readonly Declaration[], slug: string, argv: readonly string[]): Promise<number> {
  const rows = Number(argValue(argv, "--rows"));
  const by = (argValue(argv, "--by") ?? "").trim();
  if (!Number.isInteger(rows) || rows < SIZE_FIRST_STEP || !by) {
    console.log(`--ack needs --rows <whole number ≥ ${n(SIZE_FIRST_STEP)}> and --by "<who verified it>". Nothing was written.`);
    return 1;
  }
  const decl = declarations.find((d) => d.def.slug === slug);
  if (!decl) {
    console.log(`No typed table is declared with slug ${slug} in this checkout. Nothing was written.`);
    return 1;
  }
  const record: SizeAck = { rows, by, on: new Date().toISOString().slice(0, 10) };
  await client.query("begin");
  try {
    const copies = await readCopies(client, [decl]);
    const written = await writeAck(client, copies, record);
    await client.query("commit");
    console.log(
      `✓ ${slug}: size acknowledged at ${n(rows)} rows by ${by} on ${record.on}, on ${orgs(written)}' cop${written === 1 ? "y" : "ies"}. ` +
        `The next verification is asked for at ${n(nextSizeStep(rows))} rows.`,
    );
    return 0;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    console.log(`[WARN] the acknowledgement was not written — ${firstLine(err)}`);
    return 1;
  }
}

main(process.argv.slice(2))
  .then((code) => exitAfterDrain(code))
  .catch((err) => {
    console.error(err);
    exitAfterDrain(2);
  });
