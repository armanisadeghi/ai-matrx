/**
 * Server-side shape-doctor gather — the admin board's live twin of
 * scripts/shape/check-shapes.ts (SHAPE_SYSTEM.md R10: the status board is
 * GENERATED from the same pure doctor, never hand-maintained).
 *
 * Runs at request time in Server Components: DB inputs via the SSR supabase
 * client (authed admin, RLS — never the service key), code-derived inputs via
 * the SAME pure text extraction the CLI uses
 * (registry/shape-doctor-extract.ts), then the PURE `runShapeDoctor`, then a
 * row-level diff against the committed snapshot
 * (scripts/shape/shapes-status.json — bundled via JSON import, so the diff
 * works in every runtime).
 *
 * Degradation is LOUD, never silent: a source file unreadable at runtime
 * (production bundles don't ship repo sources) surfaces as a warning banner
 * and excludes the affected column from the drift diff instead of reporting
 * fake drift. A failed DB read throws — the board shows the error, not a
 * fabricated matrix.
 */

import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/utils/supabase/server";
import type { Json } from "@/types/database.types";
import committedSnapshot from "@/scripts/shape/shapes-status.json";
import {
  ASSET_COLUMNS,
  attributeSkillsToKinds,
  runShapeDoctor,
  type AssetCell,
  type AssetColumn,
  type AssetStatus,
  type DoctorDetectorToken,
  type ShapeDoctorReport,
  type ShapeFinding,
} from "@/features/content-ir/registry/shape-doctor";
import type { KindDetailData } from "@/features/content-ir/admin/kind-detail-types";
import {
  artifactKindSlugsFromText,
  compiledKindSlugsFromText,
  extractDetectorTokensFromTexts,
} from "@/features/content-ir/registry/shape-doctor-extract";

// ─── Code-derived inputs (fs, loud-degrade) ─────────────────────────────────

const SOURCE_FILES = {
  accumulator:
    "features/agents/redux/execution-system/utils/stream-block-accumulator.ts",
  splitter:
    "components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts",
  systemKinds: "features/content-ir/registry/system-kinds.ts",
  artifactRegistry: "features/canvas/artifact-types/artifact-type-registry.ts",
} as const;

function readSource(relPath: string): string | null {
  try {
    return readFileSync(join(process.cwd(), relPath), "utf8");
  } catch {
    return null;
  }
}

interface CodeInputs {
  detectorTokens: DoctorDetectorToken[];
  compiledKinds: string[];
  artifactKinds: string[];
  /** Columns whose live value depends on unavailable sources — excluded from
   * the snapshot diff so degraded runtimes never report fake drift. */
  excludedFromDrift: AssetColumn[];
  warnings: string[];
}

function gatherCodeInputs(): CodeInputs {
  const warnings: string[] = [];
  const excluded = new Set<AssetColumn>();

  const accumulatorText = readSource(SOURCE_FILES.accumulator);
  const splitterText = readSource(SOURCE_FILES.splitter);
  let detectorTokens: DoctorDetectorToken[] = [];
  if (accumulatorText && splitterText) {
    const { tokens, failures } = extractDetectorTokensFromTexts({
      accumulatorText,
      splitterText,
    });
    detectorTokens = tokens;
    for (const f of failures) {
      warnings.push(
        `Frozen detector literal ${f.literal} not found in ${f.file} — the detector census is blind for it (run pnpm check:shapes for the CLI red).`,
      );
    }
  } else {
    warnings.push(
      "Detector sources unreadable in this runtime — detector-token findings omitted; run pnpm check:shapes locally for the full census.",
    );
  }

  const systemKindsText = readSource(SOURCE_FILES.systemKinds);
  const artifactText = readSource(SOURCE_FILES.artifactRegistry);
  let compiledKinds: string[] = [];
  let artifactKinds: string[] = [];
  if (systemKindsText) {
    compiledKinds = compiledKindSlugsFromText(systemKindsText);
  }
  if (artifactText) {
    artifactKinds = artifactKindSlugsFromText(artifactText);
  }
  if (!systemKindsText || !artifactText) {
    excluded.add("component");
    warnings.push(
      "system-kinds.ts / artifact-type-registry.ts unreadable in this runtime — compiled render paths under-report, so the Component column is excluded from the drift diff.",
    );
  }

  return {
    detectorTokens,
    compiledKinds,
    artifactKinds,
    excludedFromDrift: [...excluded],
    warnings,
  };
}

// ─── DB gather (SSR client, RLS-scoped, read-only) ──────────────────────────

interface ComponentDetailRow {
  id: string;
  kindDefinitionId: string;
  platform: string;
  role: string;
  componentKey: string;
  source: string;
  isActive: boolean;
  isDefault: boolean;
}

interface SurfaceDetailRow {
  id: string;
  kindDefinitionId: string;
  surfaceType: string;
  token: string;
  parserStrategy: string;
  streaming: boolean;
  isActive: boolean;
}

interface ContentBlockDetailRow {
  id: string;
  label: string;
  template: string;
}

interface DbGather {
  kinds: Array<{
    id: string;
    kind: string;
    label: string;
    isActive: boolean;
    emittedJsonSchema: Json | null;
    sampleData: Json | null;
    updatedAt: string;
    data: Json | null;
    version: number;
    visibility: string;
  }>;
  examples: Array<{
    id: string;
    kindDefinitionId: string;
    isCanonical: boolean;
    data: Json;
    updatedAt: string;
  }>;
  components: ComponentDetailRow[];
  surfaces: SurfaceDetailRow[];
  renderBlockSkills: Array<{ skillId: string; label: string; body: string | null }>;
  contentBlocks: ContentBlockDetailRow[];
}

async function fetchDbGather(): Promise<DbGather> {
  const supabase = await createClient();

  const [kindsRes, examplesRes, componentsRes, surfacesRes, skillsRes, blocksRes] =
    await Promise.all([
      supabase
        .schema("content_ir")
        .from("kind_definition")
        .select(
          "id,kind,label,is_active,emitted_json_schema,sample_data,updated_at,data,version,visibility",
        )
        .is("deleted_at", null),
      supabase
        .schema("content_ir")
        .from("kind_example")
        .select("id,kind_definition_id,is_canonical,data,updated_at")
        .is("deleted_at", null),
      supabase
        .schema("content_ir")
        .from("kind_component")
        .select(
          "id,kind_definition_id,platform,role,component_key,source,is_active,is_default",
        )
        .is("deleted_at", null),
      supabase
        .schema("content_ir")
        .from("kind_surface")
        .select(
          "id,kind_definition_id,surface_type,token,parser_strategy,streaming,is_active",
        )
        .is("deleted_at", null),
      supabase
        .schema("skill")
        .from("definition")
        .select("skill_id,label,body")
        .eq("skill_type", "render_block")
        .is("deleted_at", null),
      supabase.from("content_blocks").select("id,label,template").is("deleted_at", null),
    ]);

  const fail = (what: string, error: { message: string } | null): never => {
    throw new Error(`shape doctor read ${what} failed: ${error?.message ?? "unknown error"}`);
  };
  if (kindsRes.error) fail("content_ir.kind_definition", kindsRes.error);
  if (examplesRes.error) fail("content_ir.kind_example", examplesRes.error);
  if (componentsRes.error) fail("content_ir.kind_component", componentsRes.error);
  if (surfacesRes.error) fail("content_ir.kind_surface", surfacesRes.error);
  if (skillsRes.error) fail("skill.definition", skillsRes.error);
  if (blocksRes.error) fail("public.content_blocks", blocksRes.error);

  return {
    kinds: (kindsRes.data ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      isActive: r.is_active,
      emittedJsonSchema: r.emitted_json_schema,
      sampleData: r.sample_data,
      updatedAt: r.updated_at,
      data: r.data,
      version: r.version,
      visibility: r.visibility,
    })),
    examples: (examplesRes.data ?? []).map((r) => ({
      id: r.id,
      kindDefinitionId: r.kind_definition_id,
      isCanonical: r.is_canonical,
      data: r.data,
      updatedAt: r.updated_at,
    })),
    components: (componentsRes.data ?? []).map((r) => ({
      id: r.id,
      kindDefinitionId: r.kind_definition_id,
      platform: r.platform,
      role: r.role,
      componentKey: r.component_key,
      source: r.source,
      isActive: r.is_active,
      isDefault: r.is_default,
    })),
    surfaces: (surfacesRes.data ?? []).map((r) => ({
      id: r.id,
      kindDefinitionId: r.kind_definition_id,
      surfaceType: r.surface_type,
      token: r.token,
      parserStrategy: r.parser_strategy,
      streaming: r.streaming,
      isActive: r.is_active,
    })),
    renderBlockSkills: (skillsRes.data ?? []).map((r) => ({
      skillId: r.skill_id,
      label: r.label,
      body: r.body,
    })),
    contentBlocks: (blocksRes.data ?? []).map((r) => ({
      id: r.id,
      label: r.label,
      template: r.template,
    })),
  };
}

// ─── Live doctor run ────────────────────────────────────────────────────────

export interface LiveDoctorRun {
  report: ShapeDoctorReport;
  db: DbGather;
  excludedFromDrift: AssetColumn[];
  warnings: string[];
}

export async function runLiveShapeDoctor(): Promise<LiveDoctorRun> {
  const db = await fetchDbGather();
  const code = gatherCodeInputs();

  const report = runShapeDoctor({
    kinds: db.kinds.map((k) => ({
      id: k.id,
      kind: k.kind,
      label: k.label,
      isActive: k.isActive,
      emittedJsonSchema: k.emittedJsonSchema,
      sampleData: k.sampleData,
      updatedAt: k.updatedAt,
    })),
    examples: db.examples,
    components: db.components,
    surfaces: db.surfaces,
    renderBlockSkills: db.renderBlockSkills,
    contentBlocks: db.contentBlocks,
    detectorTokens: code.detectorTokens,
    codeRenderPaths: {
      compiledKinds: code.compiledKinds,
      artifactKinds: code.artifactKinds,
    },
  });

  return {
    report,
    db,
    excludedFromDrift: code.excludedFromDrift,
    warnings: code.warnings,
  };
}

// ─── Board model (live vs committed snapshot) ───────────────────────────────

interface SnapshotRow {
  kind: string;
  is_active: boolean;
  assets: Record<string, string>;
}

export type BoardRowPresence = "both" | "live-only" | "snapshot-only";

export interface KindBoardRow {
  kind: string;
  label: string;
  isActive: boolean;
  presence: BoardRowPresence;
  /** Live cells (snapshot-only rows carry the snapshot's statuses, no details). */
  cells: Record<AssetColumn, AssetCell>;
  /** Cells whose status differs from the committed snapshot. */
  driftedCells: AssetColumn[];
  /** is_active flipped vs the snapshot. */
  activeDrift: boolean;
  /** Live RED finding codes naming this kind. */
  redCodes: string[];
}

export interface KindStatusBoardModel {
  rows: KindBoardRow[];
  redFindings: ShapeFinding[];
  yellowFindingCount: number;
  totals: ShapeDoctorReport["totals"];
  driftedRowCount: number;
  snapshotStamp: string;
  excludedFromDrift: AssetColumn[];
  warnings: string[];
  generatedAt: string;
}

function snapshotStatus(value: string | undefined): AssetStatus | null {
  return value === "ok" || value === "warn" || value === "missing" ? value : null;
}

export async function buildKindStatusBoard(): Promise<KindStatusBoardModel> {
  const { report, excludedFromDrift, warnings } = await runLiveShapeDoctor();

  const snapshotRows = new Map<string, SnapshotRow>(
    (committedSnapshot.rows as SnapshotRow[]).map((r) => [r.kind, r]),
  );
  const excluded = new Set<AssetColumn>(excludedFromDrift);

  const redFindings = report.findings.filter((f) => f.severity === "red");
  const redCodesByKind = new Map<string, string[]>();
  for (const f of redFindings) {
    if (!f.kind) continue;
    const list = redCodesByKind.get(f.kind) ?? [];
    list.push(f.code);
    redCodesByKind.set(f.kind, list);
  }

  const rows: KindBoardRow[] = report.rows.map((row) => {
    const snapshot = snapshotRows.get(row.kind);
    snapshotRows.delete(row.kind);

    const driftedCells: AssetColumn[] = [];
    if (snapshot) {
      for (const col of ASSET_COLUMNS) {
        if (excluded.has(col)) continue;
        const committed = snapshotStatus(snapshot.assets[col]);
        if (committed !== null && committed !== row.assets[col].status) {
          driftedCells.push(col);
        }
      }
    }

    return {
      kind: row.kind,
      label: row.label,
      isActive: row.isActive,
      presence: snapshot ? "both" : "live-only",
      cells: row.assets,
      driftedCells,
      activeDrift: snapshot ? snapshot.is_active !== row.isActive : false,
      redCodes: redCodesByKind.get(row.kind) ?? [],
    };
  });

  // Kinds the snapshot knows but the live DB no longer has — shown, never hidden.
  for (const leftover of snapshotRows.values()) {
    const cells = {} as Record<AssetColumn, AssetCell>;
    for (const col of ASSET_COLUMNS) {
      cells[col] = {
        status: snapshotStatus(leftover.assets[col]) ?? "missing",
        detail: "committed snapshot value — kind is GONE from the live DB",
      };
    }
    rows.push({
      kind: leftover.kind,
      label: leftover.kind,
      isActive: leftover.is_active,
      presence: "snapshot-only",
      cells,
      driftedCells: [],
      activeDrift: false,
      redCodes: [],
    });
  }
  rows.sort((a, b) => a.kind.localeCompare(b.kind));

  const driftedRowCount = rows.filter(
    (r) => r.presence !== "both" || r.driftedCells.length > 0 || r.activeDrift,
  ).length;

  return {
    rows,
    redFindings,
    yellowFindingCount: report.findings.filter((f) => f.severity === "yellow").length,
    totals: report.totals,
    driftedRowCount,
    snapshotStamp: committedSnapshot.generated_for,
    excludedFromDrift,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Per-kind detail (the [kind] page's server payload) ─────────────────────
// Shape lives in kind-detail-types.ts (shared with the client tabs).

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function gatherKindDetail(
  kindSlug: string,
): Promise<KindDetailData | null> {
  const { report, db, warnings } = await runLiveShapeDoctor();

  const kind = db.kinds.find((k) => k.kind === kindSlug);
  const doctorRow = report.rows.find((r) => r.kind === kindSlug);
  if (!kind || !doctorRow) return null;

  const knownKinds = new Set(db.kinds.map((k) => k.kind));
  const skills = attributeSkillsToKinds(db.renderBlockSkills, knownKinds).filter(
    (t) => t.kind === kindSlug,
  );

  const blockPattern = new RegExp(`"__kind"\\s*:\\s*"${escapeRegExp(kindSlug)}"`);
  const contentBlocks = db.contentBlocks
    .filter((b) => blockPattern.test(b.template))
    .map((b) => ({ id: b.id, label: b.label }));

  return {
    id: kind.id,
    kind: kind.kind,
    label: kind.label,
    isActive: kind.isActive,
    version: kind.version,
    visibility: kind.visibility,
    updatedAt: kind.updatedAt,
    fieldData: kind.data,
    emittedJsonSchema: kind.emittedJsonSchema,
    doctorRow,
    skills,
    contentBlocks,
    components: db.components
      .filter((c) => c.kindDefinitionId === kind.id)
      .map(({ kindDefinitionId: _ignored, ...rest }) => rest),
    surfaces: db.surfaces
      .filter((s) => s.kindDefinitionId === kind.id)
      .map(({ kindDefinitionId: _ignored, ...rest }) => rest),
    warnings,
  };
}
