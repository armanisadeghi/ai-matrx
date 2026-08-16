import { supabase } from "@/utils/supabase/client";
import {
  parsePack,
  type ExpertisePack,
  type ExpertisePackRow,
  type PackDesk,
  type PackPrinciple,
  type PackSections,
  type PackSource,
  type PackStatus,
} from "./types";

/**
 * Direct supabase-js data layer for Expertise Packs (platform.expertise_pack).
 * RLS is live (canonical 'system' variant): public packs readable by everyone,
 * owner/org writes. Per platform doctrine there is no Python hop for these
 * pure UI↔DB operations.
 */

const packTable = () => supabase.schema("platform").from("expertise_pack");

export async function getPack(id: string): Promise<ExpertisePack | null> {
  const { data, error } = await packTable()
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? parsePack(data as ExpertisePackRow) : null;
}

export interface PackIntake {
  /** "What are you trying to build?" — the only required intake answer. */
  goal: string;
  /** Who will actually run this? */
  who_runs_it?: string;
  /** Where does the knowledge live? */
  knowledge_lives?: string;
  /** What happens if it gets it wrong? Sets guardrail intensity later. */
  stakes?: string;
  /** "If you handed this to ChatGPT today…" — the baseline we're beating. */
  benchmark?: string;
}

export interface CreatePackInput {
  name: string;
  description: string;
  source: PackSource;
  organizationId: string;
  /** Guided-start answers; stored on metadata.intake — the Interviewer reads them. */
  intake?: PackIntake;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

export async function createDraftPack(
  input: CreatePackInput,
): Promise<ExpertisePack> {
  const base = slugify(input.name) || "pack";
  // Slug is globally unique among live rows; suffix on collision.
  let slug = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await packTable()
      .insert({
        name: input.name,
        slug,
        description: input.description,
        source: input.source as never,
        sections: { G: { label: "General" } } as never,
        principles: [] as never,
        status: "draft",
        organization_id: input.organizationId,
        ...(input.intake
          ? { metadata: { intake: input.intake } as never }
          : {}),
      })
      .select("*")
      .single();
    if (!error) return parsePack(data as ExpertisePackRow);
    if (error.code === "23505") {
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      continue;
    }
    throw error;
  }
  throw new Error("Could not create the pack: slug collision persisted.");
}

/**
 * Save the pack's rules (and optionally sections). Bumps `version` with an
 * optimistic-lock on the version the editor loaded — a concurrent edit
 * surfaces as a conflict instead of silently overwriting.
 */
export async function savePrinciples(opts: {
  packId: string;
  expectedVersion: number;
  principles: PackPrinciple[];
  sections?: PackSections;
}): Promise<ExpertisePack> {
  const patch: Record<string, unknown> = {
    principles: opts.principles,
    version: opts.expectedVersion + 1,
  };
  if (opts.sections) patch.sections = opts.sections;
  const { data, error } = await packTable()
    .update(patch as never)
    .eq("id", opts.packId)
    .eq("version", opts.expectedVersion)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      "This pack changed while you were editing (someone else saved a newer version). Reload to get the latest rules — your changes are still on screen.",
    );
  }
  return parsePack(data as ExpertisePackRow);
}

export async function updatePackMeta(opts: {
  packId: string;
  patch: Partial<{
    name: string;
    description: string;
    source: PackSource;
    status: PackStatus;
    visibility: ExpertisePackRow["visibility"];
  }>;
}): Promise<ExpertisePack> {
  const { data, error } = await packTable()
    .update(opts.patch as never)
    .eq("id", opts.packId)
    .select("*")
    .single();
  if (error) throw error;
  return parsePack(data as ExpertisePackRow);
}

export async function softDeletePack(packId: string): Promise<void> {
  const { error } = await packTable()
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq("id", packId);
  if (error) throw error;
}

export interface DeskRun {
  id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  steps_executed: number | null;
  /** Summed node cost (workflow.node_outcome output.usage.cost_usd); null when unpriced. */
  cost_usd: number | null;
}

const RUNS_PER_DESK = 5;

/**
 * Recent runs per desk, with per-run cost summed from node outcomes. Two
 * bounded reads (runs, then their node costs) — a preview surface, so a bare
 * select with limits is correct here, never a completeness read.
 */
export async function listRecentRunsForDesks(
  deskIds: string[],
): Promise<Record<string, DeskRun[]>> {
  if (deskIds.length === 0) return {};
  const { data: runs, error } = await supabase
    .schema("workflow")
    .from("run")
    .select(
      "id,definition_id,status,created_at,started_at,completed_at,steps_executed",
    )
    .in("definition_id", deskIds)
    .order("created_at", { ascending: false })
    .limit(RUNS_PER_DESK * deskIds.length);
  if (error) throw error;

  const byDesk: Record<string, DeskRun[]> = {};
  const kept: { id: string; definition_id: string }[] = [];
  for (const row of runs ?? []) {
    const deskId = String(row.definition_id);
    const bucket = (byDesk[deskId] ??= []);
    if (bucket.length >= RUNS_PER_DESK) continue;
    bucket.push({
      id: row.id,
      status: String(row.status),
      created_at: row.created_at,
      started_at: row.started_at,
      completed_at: row.completed_at,
      steps_executed: row.steps_executed,
      cost_usd: null,
    });
    kept.push({ id: row.id, definition_id: deskId });
  }
  if (kept.length === 0) return byDesk;

  const { data: outcomes, error: outcomeError } = await supabase
    .schema("workflow")
    .from("node_outcome")
    // Widened to `string` because the JSON-path alias sends the literal-type
    // parser into TS2589; `.returns<>()` states the row shape at the boundary
    // (the catalog.ts-sanctioned pattern).
    .select("run_id, cost:output->usage->>cost_usd" as string)
    .in(
      "run_id",
      kept.map((r) => r.id),
    )
    .returns<{ run_id: string; cost: string | null }[]>();
  if (outcomeError) throw outcomeError;
  const costByRun = new Map<string, number>();
  for (const row of outcomes ?? []) {
    const cost = row.cost === null ? NaN : Number(row.cost);
    if (Number.isFinite(cost)) {
      costByRun.set(row.run_id, (costByRun.get(row.run_id) ?? 0) + cost);
    }
  }
  for (const bucket of Object.values(byDesk)) {
    for (const run of bucket) {
      const total = costByRun.get(run.id);
      if (total !== undefined) run.cost_usd = total;
    }
  }
  return byDesk;
}

export interface DeskRunVerdict {
  status: string;
  /** The chief's ruling (edit + generate shapes both end on node "chief"). */
  chiefText: string | null;
  /** The editor's corrected text (edit shape only). */
  editorText: string | null;
}

/**
 * A finished run's human-facing result: the chief's ruling + (edit shape)
 * the corrected text, read straight off the terminal node outcomes.
 */
export async function getDeskRunVerdict(
  runId: string,
): Promise<DeskRunVerdict | null> {
  const [{ data: run, error: runError }, { data: outcomes, error }] =
    await Promise.all([
      supabase
        .schema("workflow")
        .from("run")
        .select("id,status")
        .eq("id", runId)
        .maybeSingle(),
      supabase
        .schema("workflow")
        .from("node_outcome")
        .select("node_id, text:output->>final_text" as string)
        .eq("run_id", runId)
        .in("node_id", ["chief", "editor"])
        .returns<{ node_id: string; text: string | null }[]>(),
    ]);
  if (runError) throw runError;
  if (error) throw error;
  if (!run) return null;
  const byNode = new Map((outcomes ?? []).map((o) => [o.node_id, o.text]));
  return {
    status: String(run.status),
    chiefText: byNode.get("chief") ?? null,
    editorText: byNode.get("editor") ?? null,
  };
}

/**
 * Desks compiled from a pack — workflow.definition rows whose metadata is
 * stamped `compiled_from_pack` by the compiler (pack_to_desk contract).
 */
export async function listDesksForPack(packId: string): Promise<PackDesk[]> {
  const { data, error } = await supabase
    .schema("workflow")
    .from("definition")
    .select("id,name,description,metadata,created_at,updated_at,visibility")
    .eq("metadata->>compiled_from_pack", packId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      desk_kind: typeof meta.desk_kind === "string" ? meta.desk_kind : null,
      compiled_from_pack:
        typeof meta.compiled_from_pack === "string"
          ? meta.compiled_from_pack
          : null,
      pack_version:
        typeof meta.pack_version === "number" ? meta.pack_version : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      visibility: String(row.visibility),
    };
  });
}
