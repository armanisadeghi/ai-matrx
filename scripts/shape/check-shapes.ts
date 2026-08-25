#!/usr/bin/env tsx
/**
 * check-shapes — the Shape System doctor CLI (SHAPE_SYSTEM.md R10).
 *
 * Gathers everything a Shape is supposed to have — kind_definition schema,
 * kind_example samples, kind_component registrations, kind_surface detection,
 * render_block skills, content blocks, the frozen detector literals, and the
 * compiled render paths — then runs the PURE doctor
 * (features/content-ir/registry/shape-doctor.ts) and prints a per-kind
 * completeness matrix + red/yellow findings. The structural gate is
 * RECOMPUTED via the dual gate's own ajv leg; stored validation_status /
 * is_active are never trusted.
 *
 *   pnpm check:shapes            # loud report + committed-snapshot drift check, exit 0
 *   pnpm check:shapes:strict     # exit 1 when any RED finding exists (CI gate)
 *   pnpm check:shapes:components # BLOCKING gate: every ACTIVE bundled web/output
 *                                #   kind_component key resolves in block-dispatch
 *                                #   (--gate=<code> exits 1 on those reds ALONE)
 *   pnpm check:shapes:refresh    # rewrite scripts/shape/shapes-status.json +
 *                                #   features/content-ir/docs/SHAPES_STATUS.md
 *   tsx … --verbose              # every finding line (default groups yellows)
 *
 * READ-ONLY against the DB — this script never writes to Supabase.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import {
  ASSET_COLUMNS,
  GENERATED_CONTRACT_FAMILIES,
  runShapeDoctor,
  type AssetColumn,
  type AssetStatus,
  type DoctorContractManifestEntry,
  type DoctorContentBlock,
  type DoctorDetectorToken,
  type DoctorKindComponent,
  type DoctorKindDefinition,
  type DoctorKindEdge,
  type DoctorKindExample,
  type DoctorKindSurface,
  type DoctorRenderBlockSkill,
  type ShapeDoctorReport,
  type ShapeFinding,
} from "../../features/content-ir/registry/shape-doctor";
import {
  DB_KIND_COMPONENT_KEY,
  GENERIC_STRUCTURED_COMPONENT_KEY,
} from "@ai-matrx/content-ir-react";
import { KIND_LOADING_SLUGS } from "../../features/content-ir/react/loading/kind-loading-slugs";
import { inferLoadingSlugFromJsonSchema } from "../../features/content-ir/react/loading/infer-loading-slug";
import {
  artifactKindSlugsFromText,
  compiledKindSlugsFromText,
  compiledLoadingSlugsFromTexts,
  extractDetectorTokensFromTexts,
  extractDispatchKeysFromText,
  extractHostSurfaceTokensFromTexts,
  type DetectorExtractFailure,
  type DispatchKeyExtraction,
  type HostSurfaceExtraction,
} from "../../features/content-ir/registry/shape-doctor-extract";
import { readAllRows } from "../../lib/supabase/readAllRows";
import { parseContractManifestSnapshot } from "./contract-manifest-format";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SYSTEM_KINDS_PATH = resolve(
  ROOT,
  "features/content-ir/registry/system-kinds.ts",
);
const SNAPSHOT_PATH = resolve(ROOT, "scripts/shape/shapes-status.json");
const MARKDOWN_PATH = resolve(ROOT, "features/content-ir/docs/SHAPES_STATUS.md");

const ACCUMULATOR_PATH = resolve(
  ROOT,
  "features/agents/redux/execution-system/utils/stream-block-accumulator.ts",
);
const SPLITTER_PATH = resolve(
  ROOT,
  "components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts",
);
const ARTIFACT_REGISTRY_PATH = resolve(
  ROOT,
  "features/canvas/artifact-types/artifact-type-registry.ts",
);
const BLOCK_DISPATCH_PATH = resolve(
  ROOT,
  "components/mardown-display/chat-markdown/block-registry/block-dispatch.tsx",
);

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function box(lines: string[], color: string): void {
  const width = Math.max(...lines.map((l) => l.length));
  const bar = "═".repeat(width + 2);
  console.error(`${color}${C.bold}╔${bar}╗${C.reset}`);
  for (const l of lines) console.error(`${color}${C.bold}║ ${l.padEnd(width)} ║${C.reset}`);
  console.error(`${color}${C.bold}╚${bar}╝${C.reset}`);
}

// ─── Code-derived inputs (shared pure extraction; this side only reads files) ─
//
// The extraction itself (frozen detector literals, system-kinds bridge facets,
// artifact-registry `kinds:` facades — and WHY it is text-level, not imports)
// lives in features/content-ir/registry/shape-doctor-extract.ts, shared with
// the server-side admin board.

function extractDetectorTokens(): {
  tokens: DoctorDetectorToken[];
  failures: DetectorExtractFailure[];
} {
  return extractDetectorTokensFromTexts({
    accumulatorText: readFileSync(ACCUMULATOR_PATH, "utf8"),
    splitterText: readFileSync(SPLITTER_PATH, "utf8"),
  });
}

function extractHostSurfaceTokens(): HostSurfaceExtraction {
  return extractHostSurfaceTokensFromTexts({
    accumulatorText: readFileSync(ACCUMULATOR_PATH, "utf8"),
    splitterText: readFileSync(SPLITTER_PATH, "utf8"),
  });
}

function compiledKindSlugs(): string[] {
  return compiledKindSlugsFromText(readFileSync(SYSTEM_KINDS_PATH, "utf8"));
}

/**
 * Compiled `loadingComponent` declarations live in system-kinds.ts AND in the
 * per-family kinds/*.ts modules it imports — scan them all.
 */
function compiledLoadingSlugs(): Map<string, string> {
  const kindsDir = resolve(ROOT, "features/content-ir/kinds");
  const texts = [readFileSync(SYSTEM_KINDS_PATH, "utf8")];
  for (const name of readdirSync(kindsDir)) {
    if (!name.endsWith(".ts")) continue;
    texts.push(readFileSync(resolve(kindsDir, name), "utf8"));
  }
  return compiledLoadingSlugsFromTexts(texts);
}

/**
 * The slug the RUNTIME would DERIVE for each kind that declares none — the
 * doctor's `inferredLoadingSlugs`. The derivation itself is the shipped module
 * (react/loading/infer-loading-slug.ts), never a reimplementation: the doctor
 * must report the loader the user actually sees.
 *
 * Source is `emitted_json_schema`, the shape description EVERY kind_definition
 * row carries. The runtime tries the parser `KindSchema` first, but that is
 * reconstructed from `kind_definition.data` — which the doctor does not gather
 * and which is NULL for the python-owned majority — and both doors normalize
 * to the same field census, so the emitted schema is the one source both this
 * CLI and the admin board can read identically (a second source would make the
 * two disagree and manufacture snapshot drift).
 *
 * A static import: pure TypeScript with type-only dependencies, so there is no
 * "module unavailable" path to degrade from — a missing module is a build/run
 * failure, which is as loud as it gets.
 */
function inferredLoadingSlugs(kinds: DoctorKindDefinition[]): Map<string, string> {
  const derived = new Map<string, string>();
  for (const k of kinds) {
    const slug = inferLoadingSlugFromJsonSchema(k.emittedJsonSchema);
    if (slug !== null) derived.set(k.kind, slug);
  }
  return derived;
}

function artifactRegistryKindSlugs(): string[] {
  return artifactKindSlugsFromText(readFileSync(ARTIFACT_REGISTRY_PATH, "utf8"));
}

/**
 * Every block type `resolveBlockDispatch` can answer — the code side of the
 * dangling-`component_key` gate. The two computed keys are passed as IMPORTED
 * constants, so renaming either one fails extraction loudly instead of
 * silently shrinking the key set.
 */
function dispatchKeys(): DispatchKeyExtraction {
  return extractDispatchKeysFromText(readFileSync(BLOCK_DISPATCH_PATH, "utf8"), {
    DB_KIND_COMPONENT_KEY,
    GENERIC_STRUCTURED_COMPONENT_KEY,
  });
}

// ─── Coverage-gate inputs (generated crosswalk + aidream contract manifest) ─

const CROSSWALK_PATH = resolve(ROOT, "scripts/shape/content-vocab-crosswalk.json");
const CONTRACT_MANIFEST_PATH = resolve(
  ROOT,
  "scripts/shape/content-ir-contract-manifest.json",
);

interface CoverageInputFailure {
  what: string;
  detail: string;
}

/** Every classified name from the generated content-vocab crosswalk. */
function loadCrosswalkNames(): { names: ReadonlySet<string> | undefined; failure: CoverageInputFailure | null } {
  if (!existsSync(CROSSWALK_PATH)) {
    return {
      names: undefined,
      failure: {
        what: "content-vocab crosswalk",
        detail: `${CROSSWALK_PATH} missing — run pnpm check:shapes:crosswalk:refresh and commit`,
      },
    };
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(CROSSWALK_PATH, "utf8"));
    if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { rows?: unknown }).rows)) {
      throw new Error(`no "rows" array`);
    }
    const names = new Set<string>();
    for (const row of (parsed as { rows: unknown[] }).rows) {
      const name = (row as { name?: unknown }).name;
      if (typeof name !== "string") throw new Error("row without string name");
      names.add(name);
    }
    if (names.size === 0) throw new Error("zero rows");
    return { names, failure: null };
  } catch (err) {
    return {
      names: undefined,
      failure: {
        what: "content-vocab crosswalk",
        detail: `${CROSSWALK_PATH} unreadable (${err instanceof Error ? err.message : String(err)}) — regenerate with pnpm check:shapes:crosswalk:refresh`,
      },
    };
  }
}

/** The slim aidream generated-contract inventory snapshot. */
function loadContractManifest(): {
  contracts: DoctorContractManifestEntry[] | undefined;
  failure: CoverageInputFailure | null;
} {
  if (!existsSync(CONTRACT_MANIFEST_PATH)) {
    return {
      contracts: undefined,
      failure: {
        what: "contract manifest snapshot",
        detail: `${CONTRACT_MANIFEST_PATH} missing — run pnpm check:shapes:manifest:refresh (requires aidream) and commit`,
      },
    };
  }
  try {
    const snapshot = parseContractManifestSnapshot(readFileSync(CONTRACT_MANIFEST_PATH, "utf8"));
    return {
      contracts: snapshot.contracts.map((c) => ({ kind: c.kind, family: c.family })),
      failure: null,
    };
  } catch (err) {
    return {
      contracts: undefined,
      failure: {
        what: "contract manifest snapshot",
        detail: `${CONTRACT_MANIFEST_PATH} unreadable (${err instanceof Error ? err.message : String(err)}) — regenerate with pnpm check:shapes:manifest:refresh`,
      },
    };
  }
}

// ─── DB reads (service key, read-only) ──────────────────────────────────────

interface KindDefinitionRow {
  id: string;
  kind: string;
  label: string;
  is_active: boolean;
  emitted_json_schema: unknown;
  sample_data: unknown;
  updated_at: string;
  metadata: unknown;
}
interface KindEdgeRow {
  parent_definition_id: string;
  child_definition_id: string;
  field_name: string;
}
interface KindExampleRow {
  id: string;
  kind_definition_id: string;
  is_canonical: boolean;
  data: unknown;
  updated_at: string;
}
interface KindComponentRow {
  id: string;
  kind_definition_id: string;
  platform: string;
  role: string;
  component_key: string;
  source: string;
  is_active: boolean;
}
interface KindSurfaceRow {
  id: string;
  kind_definition_id: string;
  surface_type: string;
  token: string;
  is_active: boolean;
}
interface SkillRow {
  skill_id: string;
  label: string;
  body: string | null;
}
interface ContentBlockRow {
  id: string;
  template: string;
}

interface DoctorDbInputs {
  kinds: DoctorKindDefinition[];
  examples: DoctorKindExample[];
  components: DoctorKindComponent[];
  surfaces: DoctorKindSurface[];
  edges: DoctorKindEdge[];
  renderBlockSkills: DoctorRenderBlockSkill[];
  contentBlocks: DoctorContentBlock[];
}

async function fetchDbInputs(): Promise<DoctorDbInputs> {
  dotenv.config({ path: resolve(ROOT, ".env.local") });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (.env.local)");
  }
  const supabase = createClient(url, key);

  // Completeness reads: every one of these lists decides "does this kind have
  // an X" for EVERY kind. A PostgREST-truncated read invents missing assets and
  // drops whole kinds off the matrix, so each pages to the declared total or
  // throws. (Measured 2026-08-14: kind_definition 1158, kind_example 1102 —
  // both already past the 1000-row cap.)
  const [kindRows, exampleRows, componentRows, surfaceRows, edgeRows, skillRows, blockRows] =
    await Promise.all([
      readAllRows<KindDefinitionRow>(
        ({ from, to }) =>
          supabase
            .schema("content_ir")
            .from("kind_definition")
            .select(
              "id,kind,label,is_active,emitted_json_schema,sample_data,updated_at,metadata",
              { count: "exact" },
            )
            .is("deleted_at", null)
            .order("id", { ascending: true })
            .range(from, to),
        { label: "content_ir.kind_definition" },
      ),
      readAllRows<KindExampleRow>(
        ({ from, to }) =>
          supabase
            .schema("content_ir")
            .from("kind_example")
            .select("id,kind_definition_id,is_canonical,data,updated_at", { count: "exact" })
            .is("deleted_at", null)
            .order("id", { ascending: true })
            .range(from, to),
        { label: "content_ir.kind_example" },
      ),
      readAllRows<KindComponentRow>(
        ({ from, to }) =>
          supabase
            .schema("content_ir")
            .from("kind_component")
            .select(
              "id,kind_definition_id,platform,role,component_key,source,is_active",
              { count: "exact" },
            )
            .is("deleted_at", null)
            .order("id", { ascending: true })
            .range(from, to),
        { label: "content_ir.kind_component" },
      ),
      readAllRows<KindSurfaceRow>(
        ({ from, to }) =>
          supabase
            .schema("content_ir")
            .from("kind_surface")
            .select("id,kind_definition_id,surface_type,token,is_active", { count: "exact" })
            .is("deleted_at", null)
            .order("id", { ascending: true })
            .range(from, to),
        { label: "content_ir.kind_surface" },
      ),
      // The nesting graph — required to tell a nested-only child kind (whose
      // component/surface/skill/block cells are structurally `n/a`) from a root
      // with a real, closeable gap. No `id` column: the unique triple orders it.
      readAllRows<KindEdgeRow>(
        ({ from, to }) =>
          supabase
            .schema("content_ir")
            .from("kind_edge")
            .select("parent_definition_id,child_definition_id,field_name", { count: "exact" })
            .is("deleted_at", null)
            .order("parent_definition_id", { ascending: true })
            .order("child_definition_id", { ascending: true })
            .order("field_name", { ascending: true })
            .range(from, to),
        { label: "content_ir.kind_edge" },
      ),
      readAllRows<SkillRow>(
        ({ from, to }) =>
          supabase
            .schema("skill")
            .from("definition")
            .select("skill_id,label,body", { count: "exact" })
            .eq("skill_type", "render_block")
            .is("deleted_at", null)
            .order("skill_id", { ascending: true })
            .range(from, to),
        { label: "skill.definition" },
      ),
      // Canonical: render/content blocks now live in skill.render_definition
      // (public.content_blocks retired). The shape doctor detects a kind's
      // teaching block by scanning template text either way.
      readAllRows<ContentBlockRow>(
        ({ from, to }) =>
          supabase
            .schema("skill")
            .from("render_definition")
            .select("id,template", { count: "exact" })
            .is("deleted_at", null)
            .order("id", { ascending: true })
            .range(from, to),
        { label: "skill.render_definition" },
      ),
    ]);

  return {
    kinds: kindRows.map(
      (r): DoctorKindDefinition => ({
        id: r.id,
        kind: r.kind,
        label: r.label,
        isActive: r.is_active,
        emittedJsonSchema: r.emitted_json_schema,
        sampleData: r.sample_data,
        updatedAt: r.updated_at,
        metadata: r.metadata,
      }),
    ),
    edges: edgeRows.map(
      (r): DoctorKindEdge => ({
        parentDefinitionId: r.parent_definition_id,
        childDefinitionId: r.child_definition_id,
        fieldName: r.field_name,
      }),
    ),
    examples: exampleRows.map(
      (r): DoctorKindExample => ({
        id: r.id,
        kindDefinitionId: r.kind_definition_id,
        isCanonical: r.is_canonical,
        data: r.data,
        updatedAt: r.updated_at,
      }),
    ),
    components: componentRows.map(
      (r): DoctorKindComponent => ({
        id: r.id,
        kindDefinitionId: r.kind_definition_id,
        platform: r.platform,
        role: r.role,
        componentKey: r.component_key,
        source: r.source,
        isActive: r.is_active,
      }),
    ),
    surfaces: surfaceRows.map(
      (r): DoctorKindSurface => ({
        id: r.id,
        kindDefinitionId: r.kind_definition_id,
        surfaceType: r.surface_type,
        token: r.token,
        isActive: r.is_active,
      }),
    ),
    renderBlockSkills: skillRows.map(
      (r): DoctorRenderBlockSkill => ({ skillId: r.skill_id, label: r.label, body: r.body }),
    ),
    contentBlocks: blockRows.map(
      (r): DoctorContentBlock => ({ id: r.id, template: r.template }),
    ),
  };
}

// ─── Snapshot (machine) + markdown (human) outputs ──────────────────────────

/** The drift-checked core: statuses + findings, stable order, no free-text
 * cell details (those may carry counts that churn without status change). */
interface SnapshotCore {
  columns: readonly AssetColumn[];
  rows: Array<{
    kind: string;
    is_active: boolean;
    family: string | null;
    assets: Record<AssetColumn, AssetStatus>;
  }>;
  findings: Array<{ severity: string; code: string; kind?: string; message: string }>;
}

interface SnapshotFile extends SnapshotCore {
  generated_for: string;
}

function buildSnapshotCore(report: ShapeDoctorReport): SnapshotCore {
  return {
    columns: ASSET_COLUMNS,
    rows: report.rows.map((row) => {
      const assets = {} as Record<AssetColumn, AssetStatus>;
      for (const col of ASSET_COLUMNS) assets[col] = row.assets[col].status;
      return { kind: row.kind, is_active: row.isActive, family: row.family, assets };
    }),
    findings: report.findings.map((f) => ({
      severity: f.severity,
      code: f.code,
      ...(f.kind ? { kind: f.kind } : {}),
      message: f.message,
    })),
  };
}

function generatedFor(core: SnapshotCore): string {
  const hash = createHash("sha256").update(JSON.stringify(core)).digest("hex").slice(0, 12);
  return `${core.rows.length}-kinds+${hash}`;
}

/** `n/a` renders as an em dash — visibly NOT a gap, distinct from ❌/⚠️. */
const STATUS_MARK: Record<AssetStatus, string> = {
  ok: "✅",
  warn: "⚠️",
  missing: "❌",
  "n/a": "—",
};
const COLUMN_HEADING: Record<AssetColumn, string> = {
  definition: "Definition",
  example: "Example",
  gate_structural: "Gate",
  loading: "Loading",
  component: "Component",
  skill: "Skill",
  content_block: "Content block",
  surface: "Surface",
};

/** Generated contract-family rows are aggregated in reports (634+ rows would
 * drown the display board); the snapshot keeps every row for exact drift. */
function isGeneratedFamilyRow(row: { family: string | null }): boolean {
  return row.family !== null && GENERATED_CONTRACT_FAMILIES.has(row.family);
}

function buildMarkdown(report: ShapeDoctorReport, stamp: string): string {
  const lines: string[] = [];
  lines.push("# Shape System status");
  lines.push("");
  lines.push("GENERATED by `pnpm check:shapes:refresh` — do not hand-edit.");
  lines.push("");
  lines.push(`\`generated_for: ${stamp}\``);
  lines.push("");
  lines.push(
    `${report.totals.kinds} kinds · ${report.totals.red} red finding(s) · ${report.totals.yellow} yellow finding(s) · cells: ${report.totals.cells.ok} ok / ${report.totals.cells.warn} warn / ${report.totals.cells.missing} missing / ${report.totals.cells["n/a"]} n/a`,
  );
  lines.push("");
  lines.push(
    "Legend: ✅ ok · ⚠️ warn · ❌ missing (a real, closeable gap) · — n/a (structurally inapplicable — see \"Not applicable\" below).",
  );
  lines.push("");
  const displayRows = report.rows.filter((r) => !isGeneratedFamilyRow(r));
  const generatedRows = report.rows.filter(isGeneratedFamilyRow);
  lines.push(`| Kind | Active | ${ASSET_COLUMNS.map((c) => COLUMN_HEADING[c]).join(" | ")} |`);
  lines.push(`|---|---|${ASSET_COLUMNS.map(() => "---").join("|")}|`);
  for (const row of displayRows) {
    const marks = ASSET_COLUMNS.map((c) => STATUS_MARK[row.assets[c].status]).join(" | ");
    lines.push(`| \`${row.kind}\` | ${row.isActive ? "yes" : "no"} | ${marks} |`);
  }
  lines.push("");

  if (generatedRows.length > 0) {
    lines.push(`## Generated contract families (${generatedRows.length} data-only kinds, aggregated)`);
    lines.push("");
    lines.push(
      "Published by aidream's contract publisher; render assets are structurally `n/a`, while definition / example / structural gate stay fully enforced per kind (full rows live in `scripts/shape/shapes-status.json`). Kinds with a non-ok enforced cell are listed.",
    );
    lines.push("");
    lines.push("| Family | Kinds | Active | Def ✅ | Example ✅ | Gate ✅ |");
    lines.push("|---|---|---|---|---|---|");
    const byFamily = new Map<string, typeof generatedRows>();
    for (const row of generatedRows) {
      const key = row.family ?? "";
      const list = byFamily.get(key) ?? [];
      list.push(row);
      byFamily.set(key, list);
    }
    for (const [family, rows] of [...byFamily.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const okCount = (col: AssetColumn): number =>
        rows.filter((r) => r.assets[col].status === "ok").length;
      lines.push(
        `| \`${family}\` | ${rows.length} | ${rows.filter((r) => r.isActive).length} | ${okCount("definition")} | ${okCount("example")} | ${okCount("gate_structural")} |`,
      );
    }
    const enforcedGaps = generatedRows.filter((r) =>
      (["definition", "example", "gate_structural"] as const).some(
        (c) => r.assets[c].status === "warn" || r.assets[c].status === "missing",
      ),
    );
    if (enforcedGaps.length > 0) {
      lines.push("");
      lines.push(`Non-ok enforced cells (${enforcedGaps.length} kinds):`);
      lines.push("");
      for (const row of enforcedGaps) {
        const cells = (["definition", "example", "gate_structural"] as const)
          .filter((c) => row.assets[c].status !== "ok")
          .map((c) => `${COLUMN_HEADING[c]}: ${STATUS_MARK[row.assets[c].status]}`)
          .join(", ");
        lines.push(`- \`${row.kind}\` (${row.family}${row.isActive ? "" : ", inactive"}) — ${cells}`);
      }
    }
    lines.push("");
  }

  lines.push("## Findings");
  lines.push("");
  const reds = report.findings.filter((f) => f.severity === "red");
  const yellows = report.findings.filter((f) => f.severity === "yellow");
  lines.push(`### Red (${reds.length})`);
  lines.push("");
  if (reds.length === 0) lines.push("- none");
  for (const f of reds) lines.push(`- **${f.code}** — ${f.message}`);
  lines.push("");
  lines.push(`### Yellow (${yellows.length})`);
  lines.push("");
  if (yellows.length === 0) lines.push("- none");
  for (const f of yellows) lines.push(`- **${f.code}** — ${f.message}`);
  lines.push("");

  // Not-applicable roster — one line per exempted kind, so the reader can audit
  // WHY a cell went quiet instead of taking `—` on faith.
  const exempted = displayRows.filter((r) => r.exemption !== null);
  if (exempted.length > 0) {
    lines.push(`## Not applicable (${exempted.length} kinds)`);
    lines.push("");
    lines.push(
      "These cells are structurally impossible to satisfy, so they are `n/a` and emit no finding. Derived, never declared — register a surface/component or activate the kind and the `n/a` evaporates.",
    );
    lines.push("");
    for (const row of exempted) {
      const ex = row.exemption;
      if (!ex) continue;
      const naCols = ASSET_COLUMNS.filter((c) => row.assets[c].status === "n/a");
      lines.push(
        `- \`${row.kind}\` — **${ex.class}** (${ex.subject}); n/a: ${naCols.map((c) => COLUMN_HEADING[c]).join(", ")}`,
      );
    }
    lines.push("");
  }

  const notes: string[] = [];
  for (const row of displayRows) {
    for (const col of ASSET_COLUMNS) {
      const cell = row.assets[col];
      if ((cell.status === "warn" || cell.status === "missing") && cell.detail) {
        notes.push(`- \`${row.kind}\` · ${COLUMN_HEADING[col]} — ${cell.detail}`);
      }
    }
  }
  if (notes.length > 0) {
    lines.push("## Cell notes (warn / missing)");
    lines.push("");
    lines.push(...notes);
    lines.push("");
  }
  return lines.join("\n");
}

// ─── Console report ─────────────────────────────────────────────────────────

const CONSOLE_MARK: Record<AssetStatus, string> = {
  ok: `${C.green}✓${C.reset}`,
  warn: `${C.yellow}~${C.reset}`,
  missing: `${C.red}✗${C.reset}`,
  "n/a": `${C.dim}·${C.reset}`,
};
const SHORT_HEAD: Record<AssetColumn, string> = {
  definition: "def",
  example: "ex",
  gate_structural: "gate",
  loading: "load",
  component: "comp",
  skill: "skl",
  content_block: "blk",
  surface: "srf",
};

function printMatrix(report: ShapeDoctorReport): void {
  const displayRows = report.rows.filter((r) => !isGeneratedFamilyRow(r));
  const generatedRows = report.rows.filter(isGeneratedFamilyRow);
  const kindWidth = Math.max(...displayRows.map((r) => r.kind.length), 4) + 2;
  const head = ASSET_COLUMNS.map((c) => SHORT_HEAD[c].padEnd(5)).join("");
  console.log(`\n${C.bold}${"kind".padEnd(kindWidth)}act  ${head}${C.reset}`);
  for (const row of displayRows) {
    const marks = ASSET_COLUMNS.map((c) => `${CONSOLE_MARK[row.assets[c].status]}    `).join("");
    const active = row.isActive ? `${C.green}on ${C.reset}` : `${C.dim}off${C.reset}`;
    console.log(`${row.kind.padEnd(kindWidth)}${active}  ${marks}`);
  }
  if (generatedRows.length > 0) {
    const byFamily = new Map<string, { total: number; gateOk: number }>();
    for (const row of generatedRows) {
      const entry = byFamily.get(row.family ?? "") ?? { total: 0, gateOk: 0 };
      entry.total += 1;
      if (row.assets.gate_structural.status === "ok") entry.gateOk += 1;
      byFamily.set(row.family ?? "", entry);
    }
    const summary = [...byFamily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([family, s]) => `${family} ${s.gateOk}/${s.total} gate-ok`)
      .join(" · ");
    console.log(
      `${C.dim}+ ${generatedRows.length} generated data-only contract kinds (aggregated): ${summary}${C.reset}`,
    );
  }
}

function printFindings(findings: ShapeFinding[], verbose: boolean): void {
  const reds = findings.filter((f) => f.severity === "red");
  const yellows = findings.filter((f) => f.severity === "yellow");

  if (reds.length > 0) {
    console.error("");
    box([`SHAPE DOCTOR — ${reds.length} RED finding(s)`], C.red);
    for (const f of reds) console.error(`  ${C.red}${C.bold}[${f.code}]${C.reset} ${f.message}`);
  }

  if (yellows.length > 0) {
    console.error(`\n${C.yellow}${C.bold}━━ ${yellows.length} yellow finding(s) ━━${C.reset}`);
    if (verbose) {
      for (const f of yellows) console.error(`  ${C.yellow}[${f.code}]${C.reset} ${f.message}`);
    } else {
      const byCode = new Map<string, ShapeFinding[]>();
      for (const f of yellows) {
        const list = byCode.get(f.code) ?? [];
        list.push(f);
        byCode.set(f.code, list);
      }
      for (const [code, items] of byCode) {
        const subjects = items.map((f) => f.kind ?? f.message.match(/"([^"]+)"/)?.[1] ?? "?");
        console.error(
          `  ${C.yellow}[${code}]${C.reset} ${items.length}: ${C.dim}${subjects.join(", ")}${C.reset}`,
        );
      }
      console.error(`  ${C.dim}(use --verbose for every yellow line)${C.reset}`);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const strict = argv.includes("--strict");
  // Gate mode: exit 1 on the NAMED red codes only, and print nothing else.
  // The full report carries a large, tracked backlog of other reds, so
  // `--strict` can never sit in the release gates; a single code with a zero
  // backlog can (`--gate=dangling-component-key`).
  const gateCodes = new Set(
    argv
      .filter((a) => a.startsWith("--gate="))
      .flatMap((a) => a.slice("--gate=".length).split(","))
      .map((c) => c.trim())
      .filter(Boolean),
  );
  const refresh = argv.includes("--refresh");
  const verbose = argv.includes("--verbose");

  const db = await fetchDbInputs();
  const { tokens: detectorTokens, failures: extractFailures } = extractDetectorTokens();
  const { tokens: hostSurfaceTokens, failures: hostExtractFailures } = extractHostSurfaceTokens();
  extractFailures.push(...hostExtractFailures);
  const { keys: blockDispatchKeys, failures: dispatchFailures } = dispatchKeys();
  extractFailures.push(...dispatchFailures);
  const crosswalk = loadCrosswalkNames();
  const manifest = loadContractManifest();

  const report = runShapeDoctor({
    ...db,
    detectorTokens,
    codeRenderPaths: {
      compiledKinds: compiledKindSlugs(),
      artifactKinds: artifactRegistryKindSlugs(),
      // Omitted when extraction failed — the check goes quiet, and the
      // detector-extract-failed red below says so.
      ...(dispatchFailures.length === 0 ? { dispatchKeys: blockDispatchKeys } : null),
    },
    crosswalkNames: crosswalk.names,
    hostSurfaceTokens,
    loadingLibrarySlugs: new Set<string>(KIND_LOADING_SLUGS),
    compiledLoadingSlugs: compiledLoadingSlugs(),
    inferredLoadingSlugs: inferredLoadingSlugs(db.kinds),
  });

  // Coverage inputs are load-bearing for the strict gate — a missing/corrupt
  // crosswalk or manifest snapshot means the gate is BLIND, which is itself red.
  for (const failure of [crosswalk.failure, manifest.failure]) {
    if (!failure) continue;
    report.findings.unshift({
      severity: "red",
      code: "coverage-input-missing",
      message: `${failure.what} unavailable — the coverage gate is blind: ${failure.detail}`,
    });
    report.totals.red += 1;
  }

  // Detector-literal drift is a CLI-level red: the frozen list the census
  // depends on moved/renamed — the census itself is now blind.
  for (const f of extractFailures) {
    report.findings.unshift({
      severity: "red",
      code: "detector-extract-failed",
      message: `could not extract the ${f.literal} literal from ${f.file} — that code-derived census (detector tokens / dispatch keys) is blind; update features/content-ir/registry/shape-doctor-extract.ts`,
    });
    report.totals.red += 1;
  }

  if (gateCodes.size > 0) {
    const gated = report.findings.filter(
      (f) => f.severity === "red" && gateCodes.has(f.code),
    );
    // Blind is not green: an extraction failure means the gated check could not
    // run at all, which fails exactly like a violation.
    const blind = gateCodes.has("dangling-component-key") && dispatchFailures.length > 0;
    for (const f of gated) {
      console.error(`  ${C.red}${C.bold}[${f.code}]${C.reset} ${f.message}`);
    }
    if (blind) {
      console.error(
        `  ${C.red}${C.bold}[dispatch-extract-failed]${C.reset} could not read the block-dispatch tables (${dispatchFailures
          .map((f) => f.literal)
          .join(", ")}) — the dangling-component-key gate is BLIND`,
      );
    }
    const label = [...gateCodes].join(", ");
    if (gated.length === 0 && !blind) {
      console.log(`${C.green}${C.bold}✓ check:shapes gate${C.reset} ${label}: clean`);
      return 0;
    }
    console.error(
      `\n${C.red}${C.bold}check:shapes gate${C.reset} ${label}: ${gated.length + (blind ? 1 : 0)} failure(s)`,
    );
    return 1;
  }

  const core = buildSnapshotCore(report);
  const stamp = generatedFor(core);

  if (refresh) {
    const snapshot: SnapshotFile = { generated_for: stamp, ...core };
    mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
    writeFileSync(MARKDOWN_PATH, buildMarkdown(report, stamp));
  } else if (existsSync(SNAPSHOT_PATH)) {
    // Red screamer (d): committed snapshot no longer matches the live system.
    try {
      const committed = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as SnapshotFile;
      const committedCore: SnapshotCore = {
        columns: committed.columns,
        rows: committed.rows,
        findings: committed.findings,
      };
      if (JSON.stringify(committedCore) !== JSON.stringify(core)) {
        // Recompute the committed core's stamp — a hand-edited snapshot keeps
        // its stale generated_for, which would make both sides look identical.
        report.findings.unshift({
          severity: "red",
          code: "snapshot-drift",
          message: `committed shapes-status.json (${generatedFor(committedCore)}, claims ${committed.generated_for}) differs from live (${stamp}) — run pnpm check:shapes:refresh and commit`,
        });
        report.totals.red += 1;
      }
    } catch {
      report.findings.unshift({
        severity: "red",
        code: "snapshot-drift",
        message: `scripts/shape/shapes-status.json is unreadable/corrupt — run pnpm check:shapes:refresh and commit`,
      });
      report.totals.red += 1;
    }
  }

  printMatrix(report);
  printFindings(report.findings, verbose);

  const reds = report.findings.filter((f) => f.severity === "red").length;
  const yellows = report.findings.filter((f) => f.severity === "yellow").length;
  const exemptCount = report.rows.filter((r) => r.exemption !== null).length;
  const summary = `${report.totals.kinds} kinds · cells ${report.totals.cells.ok} ok / ${report.totals.cells.warn} warn / ${report.totals.cells.missing} missing / ${report.totals.cells["n/a"]} n/a (${exemptCount} kinds structurally exempt) · ${reds} red / ${yellows} yellow finding(s)`;
  if (reds === 0) {
    console.log(`\n${C.green}${C.bold}✓ shape doctor:${C.reset} ${summary}${refresh ? ` ${C.dim}(snapshot + markdown refreshed: ${stamp})${C.reset}` : ""}`);
  } else {
    console.error(`\n${C.red}${C.bold}shape doctor:${C.reset} ${summary}${strict ? "" : ` ${C.dim}(non-blocking — use --strict for CI)${C.reset}`}`);
  }
  if (refresh) {
    console.log(`${C.dim}  wrote ${SNAPSHOT_PATH}${C.reset}`);
    console.log(`${C.dim}  wrote ${MARKDOWN_PATH}${C.reset}`);
  }

  return strict && reds > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`${C.red}${C.bold}check-shapes FAILED:${C.reset}`, err instanceof Error ? err.message : err);
    process.exit(2);
  });
