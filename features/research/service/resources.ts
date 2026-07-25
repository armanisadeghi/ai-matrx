/**
 * RESOURCE SERVICE — Supabase reads/writes for the manifest and for bundles.
 *
 * Client-direct, like the rest of `features/research/service.ts`: these are
 * ordinary RLS-owned database operations, so they never route through the Python
 * backend (see CLAUDE.md — Python is the compute boundary, not a DB gateway).
 *
 * Bundle listing follows THE VIEW LAW: every query declares its scope. A bare
 * RLS-filtered read would flood a user's personal list with every org and
 * system bundle they happen to have access to.
 */

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import type { Database } from "@/types/database.types";
import { isJsonObject } from "@/types/json";
import { parseManifest } from "../resources/manifest";
import type {
  BundleBinding,
  BundleBudget,
  ContextBundle,
  ContextBundleInput,
  ResourceManifest,
  ResourceSelector,
} from "../resources/types";

type BundleRow = Database["research"]["Tables"]["rs_context_bundle"]["Row"];
type BundleInsert =
  Database["research"]["Tables"]["rs_context_bundle"]["Insert"];
type BundleUpdate =
  Database["research"]["Tables"]["rs_context_bundle"]["Update"];

const ENTITY_TYPE = "research_topic";

// ─────────────────────────────────────────────────────────────── manifest ────

/**
 * The topic's full resource inventory in ONE round trip: sizes for every
 * selectable item, plus the keyword-rank and tag graphs. Never bodies — those
 * are fetched by the resolver for the selection only.
 *
 * RPC returns `Json` directly (no row schema) — `parseManifest` is the ingress
 * validator; see type-safety skill Pattern 1 for Json-direct RPCs.
 */
export async function getResourceManifest(
  topicId: string,
): Promise<ResourceManifest> {
  const { data, error } = await supabase.rpc(
    "research_topic_resource_manifest",
    { p_topic_id: topicId },
  );
  if (error) throw error;
  return parseManifest(data, topicId);
}

// ──────────────────────────────────────────────────────────────── bundles ────

/** Boundary parse of the JSONB columns — no whole-row casts. */
function parseSelectors(raw: unknown): ResourceSelector[] {
  if (!Array.isArray(raw)) return [];
  const out: ResourceSelector[] = [];
  for (const entry of raw) {
    if (!isJsonObject(entry)) continue;
    const kind = entry.kind;
    const mode = entry.mode;
    if (typeof kind !== "string") continue;
    out.push({
      kind: kind as ResourceSelector["kind"],
      mode:
        mode === "all" || mode === "filtered" || mode === "explicit"
          ? mode
          : "all",
      filter: isJsonObject(entry.filter)
        ? (entry.filter as ResourceSelector["filter"])
        : undefined,
      ids: Array.isArray(entry.ids)
        ? entry.ids.filter((i): i is string => typeof i === "string")
        : undefined,
      order:
        entry.order === "importance" ||
        entry.order === "authority" ||
        entry.order === "rank" ||
        entry.order === "recent"
          ? entry.order
          : undefined,
      limit: isJsonObject(entry.limit)
        ? (entry.limit as ResourceSelector["limit"])
        : undefined,
    });
  }
  return out;
}

function parseBindings(raw: unknown): BundleBinding[] {
  if (!Array.isArray(raw)) return [];
  const out: BundleBinding[] = [];
  for (const entry of raw) {
    if (!isJsonObject(entry)) continue;
    const variable = entry.variable;
    if (typeof variable !== "string" || !variable) continue;
    const kinds = Array.isArray(entry.kinds)
      ? entry.kinds.filter((k): k is string => typeof k === "string")
      : [];
    out.push({ variable, kinds: kinds as BundleBinding["kinds"] });
  }
  return out;
}

function parseBudget(raw: unknown): BundleBudget | null {
  if (!isJsonObject(raw)) return null;
  const maxTokens = raw.maxTokens;
  if (typeof maxTokens !== "number" || maxTokens <= 0) return null;
  return { maxTokens };
}

function rowToBundle(row: BundleRow): ContextBundle {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    name: row.name,
    description: row.description,
    slug: row.slug,
    selectors: parseSelectors(row.selectors),
    bindings: parseBindings(row.bindings),
    budget: parseBudget(row.budget),
    agentId: row.agent_id,
    isSystem: row.is_system,
    organizationId: row.organization_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Bundles usable on a topic: the ones saved for THIS topic plus every template
 * (`entity_id IS NULL`) — system templates and the user's own reusable ones.
 * Two explicit scopes, never a bare "everything I can see".
 */
export async function listBundlesForTopic(
  topicId: string,
): Promise<ContextBundle[]> {
  const { data, error } = await supabase
    .schema("research")
    .from("rs_context_bundle")
    .select("*")
    .eq("entity_type", ENTITY_TYPE)
    .or(`entity_id.eq.${topicId},entity_id.is.null`)
    .is("deleted_at", null)
    .order("is_system", { ascending: false })
    .order("name");
  if (error) throw error;
  return (data ?? []).map(rowToBundle);
}

/** One bundle by id. */
export async function getBundle(id: string): Promise<ContextBundle | null> {
  const { data, error } = await supabase
    .schema("research")
    .from("rs_context_bundle")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToBundle(data) : null;
}

/** A system template by its stable slug — how output definitions find theirs. */
export async function getBundleBySlug(
  slug: string,
): Promise<ContextBundle | null> {
  const { data, error } = await supabase
    .schema("research")
    .from("rs_context_bundle")
    .select("*")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToBundle(data) : null;
}

export async function createBundle(
  input: ContextBundleInput,
): Promise<ContextBundle> {
  const userId = await requireUserId();
  const insert: BundleInsert = {
    entity_type: input.entityType ?? ENTITY_TYPE,
    entity_id: input.entityId ?? null,
    name: input.name,
    description: input.description ?? null,
    slug: input.slug ?? null,
    selectors: input.selectors,
    bindings: input.bindings,
    budget: input.budget ?? null,
    agent_id: input.agentId ?? null,
    organization_id: input.organizationId ?? null,
    created_by: userId,
  };
  const { data, error } = await supabase
    .schema("research")
    .from("rs_context_bundle")
    .insert(insert)
    .select("*")
    .single();
  if (error) throw error;
  return rowToBundle(data);
}

export async function updateBundle(
  id: string,
  patch: Partial<ContextBundleInput>,
): Promise<ContextBundle> {
  const update: BundleUpdate = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.selectors !== undefined) update.selectors = patch.selectors;
  if (patch.bindings !== undefined) update.bindings = patch.bindings;
  if (patch.budget !== undefined) update.budget = patch.budget;
  if (patch.agentId !== undefined) update.agent_id = patch.agentId;
  if (patch.entityId !== undefined) update.entity_id = patch.entityId;

  const { data, error } = await supabase
    .schema("research")
    .from("rs_context_bundle")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToBundle(data);
}

/** Soft delete — the platform trash marker, never a hard row removal. */
export async function deleteBundle(id: string): Promise<void> {
  const update: BundleUpdate = {
    deleted_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .schema("research")
    .from("rs_context_bundle")
    .update(update)
    .eq("id", id);
  if (error) throw error;
}
