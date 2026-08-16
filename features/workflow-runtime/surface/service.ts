/**
 * The ONE reader/writer for `workflow.runtime_surface` (direct supabase-js,
 * per platform doctrine — pure UI↔DB, no Python hop). RLS is the ceiling;
 * every read scopes itself by definition and excludes soft-deleted rows.
 *
 * Config documents are parsed TOLERANTLY on read (parseSurfaceConfig — a run
 * page must render) and validated STRICTLY on write (validateSurfaceConfig —
 * builder and AI author both get loud, specific refusals). Saves are
 * compare-and-swap on the canonical `version` column via guardedUpdate.
 *
 * A workflow has a handful of surfaces at most (consumer/creator ×
 * full/compact/summary), so plain .select() is correct here — these are
 * never completeness reads (no readAllRows needed).
 */

import type { Json } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { guardedUpdate } from "@/utils/supabase/guardedUpdate";
import {
  parseSurfaceConfig,
  validateSurfaceConfig,
  SURFACE_SCHEMA_VERSION,
  type RunSurfaceConfig,
} from "./config";
import type { WorkflowDefinitionLike } from "../trigger-points";

export type SurfaceAudience = "consumer" | "creator";
export type SurfaceProfile = "full" | "compact" | "summary";

export interface RuntimeSurfaceRow {
  id: string;
  definitionId: string;
  name: string;
  audience: SurfaceAudience;
  profile: SurfaceProfile;
  isDefault: boolean;
  schemaVersion: number;
  config: RunSurfaceConfig;
  /** Non-fatal parse problems from the stored document (loud, never a crash). */
  warnings: string[];
  version: number;
  updatedAt: string;
}

const SURFACE_COLUMNS =
  "id,definition_id,name,audience,profile,is_default,schema_version,config,version,updated_at";

interface RawSurfaceRow {
  id: string;
  definition_id: string;
  name: string;
  audience: string;
  profile: string;
  is_default: boolean;
  schema_version: number;
  config: Json;
  version: number;
  updated_at: string;
}

const surfaceTable = () => supabase.schema("workflow").from("runtime_surface");

function toAudience(v: string): SurfaceAudience {
  return v === "creator" ? "creator" : "consumer";
}

function toProfile(v: string): SurfaceProfile {
  return v === "compact" || v === "summary" ? v : "full";
}

function rowFromRaw(raw: RawSurfaceRow): RuntimeSurfaceRow {
  const parsed = parseSurfaceConfig(raw.config);
  return {
    id: raw.id,
    definitionId: raw.definition_id,
    name: raw.name,
    audience: toAudience(raw.audience),
    profile: toProfile(raw.profile),
    isDefault: raw.is_default,
    schemaVersion: raw.schema_version,
    config: parsed.config,
    warnings: parsed.warnings,
    version: raw.version,
    updatedAt: raw.updated_at,
  };
}

/** All live surfaces for a definition, defaults first, then most recent. */
export async function listSurfaces(
  definitionId: string,
): Promise<RuntimeSurfaceRow[]> {
  const { data, error } = await surfaceTable()
    .select(SURFACE_COLUMNS)
    .eq("definition_id", definitionId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RawSurfaceRow[]).map(rowFromRaw);
}

/**
 * The default surface for a definition (optionally narrowed by audience /
 * profile). Falls back to the newest matching non-default surface so a
 * definition whose author never flagged a default still renders.
 */
export async function getDefaultSurface(
  definitionId: string,
  opts?: { audience?: SurfaceAudience; profile?: SurfaceProfile },
): Promise<RuntimeSurfaceRow | null> {
  let query = surfaceTable()
    .select(SURFACE_COLUMNS)
    .eq("definition_id", definitionId)
    .is("deleted_at", null);
  if (opts?.audience) query = query.eq("audience", opts.audience);
  if (opts?.profile) query = query.eq("profile", opts.profile);
  const { data, error } = await query
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowFromRaw(data as RawSurfaceRow) : null;
}

export interface CreateSurfaceArgs {
  definitionId: string;
  /** NOT NULL in the DB — read from the active-org selector, never invented. */
  organizationId: string;
  name?: string;
  audience?: SurfaceAudience;
  profile?: SurfaceProfile;
  isDefault?: boolean;
  config: RunSurfaceConfig;
}

/** Create a surface. Validates strictly first — throws with every problem. */
export async function createSurface(
  args: CreateSurfaceArgs,
): Promise<RuntimeSurfaceRow> {
  const problems = validateSurfaceConfig(args.config);
  if (problems.length > 0) {
    throw new Error(`Surface config is invalid: ${problems.join(" ")}`);
  }
  const { data, error } = await surfaceTable()
    .insert({
      definition_id: args.definitionId,
      organization_id: args.organizationId,
      name: args.name ?? "Default",
      audience: args.audience ?? "consumer",
      profile: args.profile ?? "full",
      is_default: args.isDefault ?? false,
      schema_version: SURFACE_SCHEMA_VERSION,
      // RunSurfaceConfig is a plain JSON document by construction; the cast
      // bridges TS's structural Json type, not a runtime transformation.
      config: args.config as unknown as Json,
    })
    .select(SURFACE_COLUMNS)
    .single();
  if (error) throw error;
  return rowFromRaw(data as RawSurfaceRow);
}

export interface SaveSurfaceConfigArgs {
  id: string;
  /** The `version` the edit was based on — from the read that fed the UI. */
  expectedVersion: number;
  config: RunSurfaceConfig;
  /** Optional metadata edits saved in the SAME CAS write as the config. */
  meta?: {
    name?: string;
    audience?: SurfaceAudience;
    profile?: SurfaceProfile;
  };
}

/**
 * Save a surface's config with optimistic concurrency (CAS on `version`).
 * "conflict" means someone else saved since the read — the caller surfaces
 * the refresh choice to the user, never silently overwrites.
 */
export async function saveSurfaceConfig(
  args: SaveSurfaceConfigArgs,
): Promise<"saved" | "conflict"> {
  const problems = validateSurfaceConfig(args.config);
  if (problems.length > 0) {
    throw new Error(`Surface config is invalid: ${problems.join(" ")}`);
  }
  const result = await guardedUpdate<{ version: number }>({
    expectedVersion: args.expectedVersion,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      surfaceTable()
        .update({
          config: args.config as unknown as Json,
          schema_version: SURFACE_SCHEMA_VERSION,
          version: nextVersion,
          ...(args.meta?.name !== undefined ? { name: args.meta.name } : {}),
          ...(args.meta?.audience !== undefined
            ? { audience: args.meta.audience }
            : {}),
          ...(args.meta?.profile !== undefined
            ? { profile: args.meta.profile }
            : {}),
        })
        .eq("id", args.id)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select("version")
        .maybeSingle(),
    fetchCurrent: () =>
      surfaceTable().select("version").eq("id", args.id).maybeSingle(),
  });
  if (result.status === "saved") return "saved";
  // A vanished row (hard-refused by RLS or soft-deleted mid-edit) is a
  // conflict from the editor's point of view: reload to see the truth.
  return "conflict";
}

/**
 * Read one workflow definition's graph (nodes/edges are Json columns on
 * `workflow.definition`), parsed tolerantly to the structural shape the
 * runtime consumes. Null when unreachable (missing / deleted / no access).
 */
export async function fetchWorkflowDefinition(
  definitionId: string,
): Promise<{ id: string; name: string; definition: WorkflowDefinitionLike } | null> {
  const { data, error } = await supabase
    .schema("workflow")
    .from("definition")
    .select("id,name,nodes,edges")
    .eq("id", definitionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    definition: {
      nodes: parseNodes(data.nodes),
      edges: parseEdges(data.edges),
    },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type DefinitionNode = WorkflowDefinitionLike["nodes"][number];

function parseNodeData(raw: Record<string, unknown>): DefinitionNode["data"] {
  const data: NonNullable<DefinitionNode["data"]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "spec_type" || key === "label") {
      if (typeof value === "string") data[key] = value;
    } else {
      data[key] = value;
    }
  }
  return data;
}

function parseNodes(raw: Json): WorkflowDefinitionLike["nodes"] {
  if (!Array.isArray(raw)) return [];
  const nodes: WorkflowDefinitionLike["nodes"] = [];
  for (const n of raw) {
    if (!isRecord(n) || typeof n.id !== "string" || !n.id) continue;
    const node: DefinitionNode = { id: n.id };
    if (typeof n.type === "string") node.type = n.type;
    if (isRecord(n.data)) node.data = parseNodeData(n.data);
    nodes.push(node);
  }
  return nodes;
}

function parseEdges(raw: Json): WorkflowDefinitionLike["edges"] {
  if (!Array.isArray(raw)) return [];
  const edges: WorkflowDefinitionLike["edges"] = [];
  for (const e of raw) {
    if (
      !isRecord(e) ||
      typeof e.source !== "string" ||
      typeof e.target !== "string"
    ) {
      continue;
    }
    edges.push({
      ...e,
      id: typeof e.id === "string" && e.id ? e.id : `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
    });
  }
  return edges;
}
