/**
 * The Run Surface config document — THE SHOW (ruling R1), as one declared,
 * versioned contract.
 *
 * This is the object a person's clicks in the builder produce AND the object
 * an AI author emits (ruling R6: same document, same write path, same
 * validation — never a second). It is stored payload-blind in
 * `workflow.runtime_surface.config` with `schema_version` beside it.
 *
 * Layout model (ruling R7 — Grafana): a 24-column grid; every readout has a
 * `pos {x, y, w, h}` in grid units with vertical compaction; rows-as-groups
 * and repeat-by-data ride on readout sources rather than special layout
 * nodes. Mobile is a single column ordered by (y, x) — never a second grid.
 *
 * Parsing is TOLERANT (a malformed readout is dropped with a warning, never a
 * crash — a run page must render), but writing goes through `validate` so the
 * builder and the AI both get loud, specific refusals.
 */

import type { TriggerPointId } from "../trigger-points";

export const SURFACE_SCHEMA_VERSION = 1;

/** The Grafana-model grid: 24 columns, row unit ≈ 30px. */
export const GRID_COLUMNS = 24;
export const GRID_ROW_HEIGHT_PX = 30;

export interface GridPos {
  /** Column start, 0-based, 0..23. */
  x: number;
  /** Row start, 0-based grid units. */
  y: number;
  /** Column span, 1..24. */
  w: number;
  /** Row span in grid units, >= 1. */
  h: number;
}

// ── Sources (PLAN §4.2-2: a readout's source is often a SET, not a node) ────

export interface NodeSource {
  kind: "node";
  nodeId: string;
}
export interface NodeGroupSource {
  kind: "group";
  label: string;
  nodeIds: string[];
}
export interface ChildRunSource {
  kind: "childRun";
  /** The workflow/orchestra node whose child run this readout follows. */
  nodeId: string;
}
export interface ProgressRailSource {
  kind: "progressRail";
  /** Nodes the rail narrates; empty = every node. */
  nodeIds?: string[];
  /**
   * Synthetic sub-steps per node (the podcast pattern, generalized): while
   * the node runs, these labels advance on a randomized cadence, the last
   * held until the node settles, then all snap done. Authored, never faked
   * by the system on its own.
   */
  syntheticSteps?: Record<string, string[]>;
}
export interface StaticContentSource {
  kind: "static";
  /** Markdown, rendered through the canonical pipeline. */
  markdown: string;
}
export interface ActionSource {
  kind: "action";
  /** The node this action runs (step-mode execute) when it becomes ready. */
  nodeId: string;
  label: string;
  /** "manual" renders a button; "auto" fires when ready (Phase 4 wires auto). */
  mode: "manual" | "auto";
}

export type ReadoutSource =
  | NodeSource
  | NodeGroupSource
  | ChildRunSource
  | ProgressRailSource
  | StaticContentSource
  | ActionSource;

// ── Readouts ────────────────────────────────────────────────────────────────

/** Ruling R8 — multi-run display is an author-chosen mode, never hidden data. */
export type MultiRunMode = "stack" | "latest" | "table";

export interface ReadoutVisibility {
  /** Render only after this trigger point has fired. Absent = always. */
  appearOn?: TriggerPointId;
  /** Hide once this trigger point fires. */
  hideOn?: TriggerPointId;
  /**
   * What holds the space before data exists (R3 empty states):
   * "placeholder" reserves the box, "hidden" renders nothing until appearOn/
   * first data. ABSENT = "placeholder" — every consumer must treat only an
   * explicit "hidden" as collapsing (zero page shift), because the builder
   * encodes the placeholder choice by omitting the key.
   */
  empty?: "placeholder" | "hidden";
}

export interface Readout {
  id: string;
  /** Human title; absent = derived from the source. */
  title?: string;
  source: ReadoutSource;
  pos: GridPos;
  /** Order key for the mobile single column; absent = derived from (y, x). */
  mobileOrder?: number;
  multiRun?: MultiRunMode;
  visibility?: ReadoutVisibility;
  /**
   * R3 dual-source preference: "live" prefers the streaming lane while one
   * is attached; "persisted" always renders the settled value once it
   * exists (a formatted document usually wants this). Default "live".
   */
  prefer?: "live" | "persisted";
  /** Page this readout belongs to. Absent = the first page. */
  pageId?: string;
}

// ── Pages (trigger-point-driven, ruling R2) ─────────────────────────────────

export interface SurfacePage {
  id: string;
  title: string;
  /** Auto-advance to this page when the trigger fires. Absent = manual tabs. */
  activateOn?: TriggerPointId;
}

// ── The document ────────────────────────────────────────────────────────────

export interface RunSurfaceConfig {
  schemaVersion: number;
  /** deliverable:ready fires when this node settles (the podcast law). */
  deliverableNodeId?: string;
  pages: SurfacePage[];
  readouts: Readout[];
}

export interface SurfaceParseResult {
  config: RunSurfaceConfig;
  /** Non-fatal problems: dropped readouts, clamped positions. Loud, never a crash. */
  warnings: string[];
}

/** One human line for a readout source — shared by the builder row list and
 * the layout preview (never fork a second copy). */
export function describeSource(source: ReadoutSource): string {
  switch (source.kind) {
    case "node":
      return `Node: ${source.nodeId}`;
    case "childRun":
      return `Child run: ${source.nodeId}`;
    case "group":
      return `Group: ${source.label} (${source.nodeIds.length} nodes)`;
    case "progressRail":
      return source.nodeIds?.length
        ? `Progress rail (${source.nodeIds.length} nodes)`
        : "Progress rail (all nodes)";
    case "static":
      return "Static content";
    case "action":
      return `Action: ${source.label} → ${source.nodeId}`;
  }
}

// ── Tolerant parse (read path) ──────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function parsePos(v: unknown): GridPos | null {
  if (!isRecord(v)) return null;
  const w = clampInt(v.w, 1, GRID_COLUMNS, 12);
  return {
    x: clampInt(v.x, 0, GRID_COLUMNS - w, 0),
    y: clampInt(v.y, 0, 10_000, 0),
    w,
    h: clampInt(v.h, 1, 1_000, 6),
  };
}

const SOURCE_KINDS = new Set([
  "node",
  "group",
  "childRun",
  "progressRail",
  "static",
  "action",
]);

function parseSource(v: unknown, warnings: string[]): ReadoutSource | null {
  if (!isRecord(v) || typeof v.kind !== "string" || !SOURCE_KINDS.has(v.kind)) {
    warnings.push("A readout had no recognizable source and was dropped.");
    return null;
  }
  switch (v.kind) {
    case "node":
    case "childRun":
      return typeof v.nodeId === "string" && v.nodeId
        ? { kind: v.kind, nodeId: v.nodeId }
        : null;
    case "group": {
      const nodeIds = Array.isArray(v.nodeIds)
        ? v.nodeIds.filter((n): n is string => typeof n === "string")
        : [];
      if (nodeIds.length === 0) return null;
      return {
        kind: "group",
        label: typeof v.label === "string" ? v.label : "Group",
        nodeIds,
      };
    }
    case "progressRail": {
      const source: ProgressRailSource = { kind: "progressRail" };
      if (Array.isArray(v.nodeIds)) {
        source.nodeIds = v.nodeIds.filter(
          (n): n is string => typeof n === "string",
        );
      }
      if (isRecord(v.syntheticSteps)) {
        const steps: Record<string, string[]> = {};
        for (const [nodeId, labels] of Object.entries(v.syntheticSteps)) {
          if (Array.isArray(labels)) {
            const clean = labels.filter(
              (l): l is string => typeof l === "string" && l.length > 0,
            );
            if (clean.length > 0) steps[nodeId] = clean;
          }
        }
        if (Object.keys(steps).length > 0) source.syntheticSteps = steps;
      }
      return source;
    }
    case "static":
      return typeof v.markdown === "string"
        ? { kind: "static", markdown: v.markdown }
        : null;
    case "action":
      return typeof v.nodeId === "string" && v.nodeId
        ? {
            kind: "action",
            nodeId: v.nodeId,
            label: typeof v.label === "string" ? v.label : "Run",
            mode: v.mode === "auto" ? "auto" : "manual",
          }
        : null;
    default:
      return null;
  }
}

/**
 * Parse a stored config document. NEVER throws — a run page must render.
 * Unknown keys are ignored (forward compatibility); malformed readouts are
 * dropped with a warning.
 */
export function parseSurfaceConfig(raw: unknown): SurfaceParseResult {
  const warnings: string[] = [];
  const empty: RunSurfaceConfig = {
    schemaVersion: SURFACE_SCHEMA_VERSION,
    pages: [],
    readouts: [],
  };
  if (!isRecord(raw)) return { config: empty, warnings };

  const pages: SurfacePage[] = [];
  if (Array.isArray(raw.pages)) {
    for (const p of raw.pages) {
      if (!isRecord(p) || typeof p.id !== "string" || !p.id) continue;
      const page: SurfacePage = {
        id: p.id,
        title: typeof p.title === "string" && p.title ? p.title : p.id,
      };
      if (typeof p.activateOn === "string") page.activateOn = p.activateOn;
      pages.push(page);
    }
  }

  const readouts: Readout[] = [];
  const seenIds = new Set<string>();
  if (Array.isArray(raw.readouts)) {
    for (const r of raw.readouts) {
      if (!isRecord(r)) continue;
      const id = typeof r.id === "string" && r.id ? r.id : null;
      if (!id || seenIds.has(id)) {
        warnings.push("A readout with a missing or duplicate id was dropped.");
        continue;
      }
      const source = parseSource(r.source, warnings);
      const pos = parsePos(r.pos);
      if (!source || !pos) {
        warnings.push(`Readout "${id}" was malformed and was dropped.`);
        continue;
      }
      seenIds.add(id);
      const readout: Readout = { id, source, pos };
      if (typeof r.title === "string" && r.title) readout.title = r.title;
      if (typeof r.mobileOrder === "number") readout.mobileOrder = r.mobileOrder;
      if (r.multiRun === "stack" || r.multiRun === "latest" || r.multiRun === "table") {
        readout.multiRun = r.multiRun;
      }
      if (r.prefer === "live" || r.prefer === "persisted") readout.prefer = r.prefer;
      if (typeof r.pageId === "string" && r.pageId) readout.pageId = r.pageId;
      if (isRecord(r.visibility)) {
        const vis: ReadoutVisibility = {};
        if (typeof r.visibility.appearOn === "string") vis.appearOn = r.visibility.appearOn;
        if (typeof r.visibility.hideOn === "string") vis.hideOn = r.visibility.hideOn;
        if (r.visibility.empty === "placeholder" || r.visibility.empty === "hidden") {
          vis.empty = r.visibility.empty;
        }
        if (Object.keys(vis).length > 0) readout.visibility = vis;
      }
      readouts.push(readout);
    }
  }

  return {
    config: {
      schemaVersion:
        typeof raw.schemaVersion === "number"
          ? raw.schemaVersion
          : SURFACE_SCHEMA_VERSION,
      ...(typeof raw.deliverableNodeId === "string" && raw.deliverableNodeId
        ? { deliverableNodeId: raw.deliverableNodeId }
        : {}),
      pages,
      readouts,
    },
    warnings,
  };
}

// ── Strict validation (write path — builder AND AI author) ─────────────────

/** Returns human-readable problems; empty = valid. Loud and specific (R6). */
export function validateSurfaceConfig(config: RunSurfaceConfig): string[] {
  const problems: string[] = [];
  if (config.schemaVersion !== SURFACE_SCHEMA_VERSION) {
    problems.push(
      `schemaVersion must be ${SURFACE_SCHEMA_VERSION} (got ${config.schemaVersion}).`,
    );
  }
  const pageIds = new Set(config.pages.map((p) => p.id));
  if (pageIds.size !== config.pages.length) {
    problems.push("Page ids must be unique.");
  }
  const readoutIds = new Set<string>();
  for (const r of config.readouts) {
    if (readoutIds.has(r.id)) problems.push(`Duplicate readout id "${r.id}".`);
    readoutIds.add(r.id);
    if (r.pos.x < 0 || r.pos.x + r.pos.w > GRID_COLUMNS) {
      problems.push(
        `Readout "${r.id}" is off the grid (x=${r.pos.x}, w=${r.pos.w}, columns=${GRID_COLUMNS}).`,
      );
    }
    if (r.pos.w < 1 || r.pos.h < 1) {
      problems.push(`Readout "${r.id}" has a zero-size box.`);
    }
    if (r.pageId && !pageIds.has(r.pageId)) {
      problems.push(`Readout "${r.id}" names a page that doesn't exist ("${r.pageId}").`);
    }
  }
  return problems;
}
