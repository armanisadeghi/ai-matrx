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

export interface CreatePackInput {
  name: string;
  description: string;
  source: PackSource;
  organizationId: string;
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
