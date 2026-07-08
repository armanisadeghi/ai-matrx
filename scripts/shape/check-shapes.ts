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
 *   pnpm check:shapes:refresh    # rewrite scripts/shape/shapes-status.json +
 *                                #   features/content-ir/docs/SHAPES_STATUS.md
 *   tsx … --verbose              # every finding line (default groups yellows)
 *
 * READ-ONLY against the DB — this script never writes to Supabase.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import {
  ASSET_COLUMNS,
  runShapeDoctor,
  type AssetColumn,
  type AssetStatus,
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
  artifactKindSlugsFromText,
  compiledKindSlugsFromText,
  extractDetectorTokensFromTexts,
  type DetectorExtractFailure,
} from "../../features/content-ir/registry/shape-doctor-extract";

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

function compiledKindSlugs(): string[] {
  return compiledKindSlugsFromText(readFileSync(SYSTEM_KINDS_PATH, "utf8"));
}

function artifactRegistryKindSlugs(): string[] {
  return artifactKindSlugsFromText(readFileSync(ARTIFACT_REGISTRY_PATH, "utf8"));
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
}
interface KindSurfaceRow {
  id: string;
  kind_definition_id: string;
  surface_type: string;
  token: string;
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

  const [kindsRes, examplesRes, componentsRes, surfacesRes, edgesRes, skillsRes, blocksRes] =
    await Promise.all([
      supabase
        .schema("content_ir")
        .from("kind_definition")
        .select("id,kind,label,is_active,emitted_json_schema,sample_data,updated_at,metadata")
        .is("deleted_at", null),
      supabase
        .schema("content_ir")
        .from("kind_example")
        .select("id,kind_definition_id,is_canonical,data,updated_at")
        .is("deleted_at", null),
      supabase
        .schema("content_ir")
        .from("kind_component")
        .select("id,kind_definition_id,platform,role,component_key")
        .is("deleted_at", null),
      supabase
        .schema("content_ir")
        .from("kind_surface")
        .select("id,kind_definition_id,surface_type,token")
        .is("deleted_at", null),
      // The nesting graph — required to tell a nested-only child kind (whose
      // component/surface/skill/block cells are structurally `n/a`) from a root
      // with a real, closeable gap.
      supabase
        .schema("content_ir")
        .from("kind_edge")
        .select("parent_definition_id,child_definition_id,field_name")
        .is("deleted_at", null),
      supabase
        .schema("skill")
        .from("definition")
        .select("skill_id,label,body")
        .eq("skill_type", "render_block")
        .is("deleted_at", null),
      supabase.from("content_blocks").select("id,template").is("deleted_at", null),
    ]);

  const fail = (what: string, error: { message: string } | null): never => {
    throw new Error(`read ${what}: ${error?.message ?? "unknown error"}`);
  };
  if (kindsRes.error) fail("content_ir.kind_definition", kindsRes.error);
  if (examplesRes.error) fail("content_ir.kind_example", examplesRes.error);
  if (componentsRes.error) fail("content_ir.kind_component", componentsRes.error);
  if (surfacesRes.error) fail("content_ir.kind_surface", surfacesRes.error);
  if (edgesRes.error) fail("content_ir.kind_edge", edgesRes.error);
  if (skillsRes.error) fail("skill.definition", skillsRes.error);
  if (blocksRes.error) fail("public.content_blocks", blocksRes.error);

  const kindRows = (kindsRes.data ?? []) as KindDefinitionRow[];
  const exampleRows = (examplesRes.data ?? []) as KindExampleRow[];
  const componentRows = (componentsRes.data ?? []) as KindComponentRow[];
  const surfaceRows = (surfacesRes.data ?? []) as KindSurfaceRow[];
  const edgeRows = (edgesRes.data ?? []) as KindEdgeRow[];
  const skillRows = (skillsRes.data ?? []) as SkillRow[];
  const blockRows = (blocksRes.data ?? []) as ContentBlockRow[];

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
      }),
    ),
    surfaces: surfaceRows.map(
      (r): DoctorKindSurface => ({
        id: r.id,
        kindDefinitionId: r.kind_definition_id,
        surfaceType: r.surface_type,
        token: r.token,
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
      return { kind: row.kind, is_active: row.isActive, assets };
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
  component: "Component",
  skill: "Skill",
  content_block: "Content block",
  surface: "Surface",
};

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
  lines.push(`| Kind | Active | ${ASSET_COLUMNS.map((c) => COLUMN_HEADING[c]).join(" | ")} |`);
  lines.push(`|---|---|${ASSET_COLUMNS.map(() => "---").join("|")}|`);
  for (const row of report.rows) {
    const marks = ASSET_COLUMNS.map((c) => STATUS_MARK[row.assets[c].status]).join(" | ");
    lines.push(`| \`${row.kind}\` | ${row.isActive ? "yes" : "no"} | ${marks} |`);
  }
  lines.push("");

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
  const exempted = report.rows.filter((r) => r.exemption !== null);
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
  for (const row of report.rows) {
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
  component: "comp",
  skill: "skl",
  content_block: "blk",
  surface: "srf",
};

function printMatrix(report: ShapeDoctorReport): void {
  const kindWidth = Math.max(...report.rows.map((r) => r.kind.length), 4) + 2;
  const head = ASSET_COLUMNS.map((c) => SHORT_HEAD[c].padEnd(5)).join("");
  console.log(`\n${C.bold}${"kind".padEnd(kindWidth)}act  ${head}${C.reset}`);
  for (const row of report.rows) {
    const marks = ASSET_COLUMNS.map((c) => `${CONSOLE_MARK[row.assets[c].status]}    `).join("");
    const active = row.isActive ? `${C.green}on ${C.reset}` : `${C.dim}off${C.reset}`;
    console.log(`${row.kind.padEnd(kindWidth)}${active}  ${marks}`);
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
  const refresh = argv.includes("--refresh");
  const verbose = argv.includes("--verbose");

  const db = await fetchDbInputs();
  const { tokens: detectorTokens, failures: extractFailures } = extractDetectorTokens();

  const report = runShapeDoctor({
    ...db,
    detectorTokens,
    codeRenderPaths: {
      compiledKinds: compiledKindSlugs(),
      artifactKinds: artifactRegistryKindSlugs(),
    },
  });

  // Detector-literal drift is a CLI-level red: the frozen list the census
  // depends on moved/renamed — the census itself is now blind.
  for (const f of extractFailures) {
    report.findings.unshift({
      severity: "red",
      code: "detector-extract-failed",
      message: `could not extract the ${f.literal} literal from ${f.file} — the detector census is blind; update scripts/shape/check-shapes.ts extraction`,
    });
    report.totals.red += 1;
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
