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
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { Database } from "@/types/database.types";
import { isJsonObject } from "@/types/json";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import { fetchTopicExperts } from "@/features/crm/service";
import { parseManifest } from "../resources/manifest";
import type {
  ManifestExpert,
  ManifestPageEntities,
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
  // The experts read is a SECOND round trip on purpose: they live in `crm`,
  // and the manifest RPC is a research-schema function. It is two small reads
  // (edges + parties) and only for what a topic actually promoted, so the
  // manifest keeps its "one payload, no bodies" character.
  const [manifest, experts, entities] = await Promise.all([
    supabase.rpc("research_topic_resource_manifest", { p_topic_id: topicId }),
    loadTopicExperts(topicId),
    loadTopicPageEntities(topicId),
  ]);
  if (manifest.error) {
    // P0002 is the RPC's honest "this topic is not available to you" — RLS hid
    // the row from a SECURITY INVOKER read. Same class as `appendTopicOutput`
    // (D167): the user is inside the topic, so absence is the wrong answer.
    if (manifest.error.code === "P0002") {
      throw recordUnavailable({
        entity: "research topic",
        reason: "unknown",
        recordId: topicId,
        token: "research_topic",
        relation: "research.rs_topic",
      });
    }
    throw manifest.error;
  }
  return parseManifest(manifest.data, topicId, experts, entities);
}

/**
 * The entities every analysed page named, read beside the manifest. A SECOND
 * read on purpose, like the experts: `rs_source.page_analysis` is a body, and
 * the manifest RPC carries no bodies. Only rows that HAVE an analysis are
 * read (a few dozen on a real topic, never the whole source table).
 */
async function loadTopicPageEntities(
  topicId: string,
): Promise<ManifestPageEntities[]> {
  const strings = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const entry of value) {
      if (typeof entry !== "string") continue;
      const text = entry.replace(/\s+/g, " ").trim();
      const key = text.toLowerCase();
      if (text && !seen.has(key)) {
        seen.add(key);
        out.push(text);
      }
    }
    return out;
  };
  try {
    const { data, error } = await supabase
      .schema("research")
      .from("rs_source")
      .select("id,url,hostname,is_included,page_analysis,final_source_score")
      .eq("topic_id", topicId)
      .not("page_analysis", "is", null);
    if (error) throw error;
    const rows: ManifestPageEntities[] = [];
    for (const row of data ?? []) {
      const analysis = isJsonObject(row.page_analysis)
        ? row.page_analysis
        : null;
      if (!analysis) continue;
      const mentioned = isJsonObject(analysis.entities_mentioned)
        ? analysis.entities_mentioned
        : null;
      rows.push({
        sourceId: row.id,
        url: row.url ?? "",
        hostname: row.hostname,
        included: row.is_included ?? true,
        analysisStatus:
          typeof analysis.analysis_status === "string"
            ? analysis.analysis_status
            : null,
        pageType:
          typeof analysis.page_type === "string" ? analysis.page_type : null,
        finalScore: row.final_source_score,
        products: strings(mentioned?.products),
        organizations: strings(mentioned?.organizations),
        locations: strings(mentioned?.locations),
      });
    }
    return rows;
  } catch (e) {
    console.error(
      "[research] could not load the pages' named entities for the resource manifest — the Named offerings resource will render empty:",
      e,
    );
    return [];
  }
}

/**
 * The topic's promoted experts, flattened for the `topic.experts` resource.
 *
 * A failure here must NOT take the whole Context Builder down — the experts
 * resource simply renders empty and every other kind still resolves. It is
 * reported loudly rather than swallowed silently.
 */
async function loadTopicExperts(topicId: string): Promise<ManifestExpert[]> {
  try {
    const links = await fetchTopicExperts(topicId);
    return links.map(({ party }) => {
      const attrs = isJsonObject(party.attributes)
        ? party.attributes.research_expert
        : null;
      const research = isJsonObject(attrs) ? attrs : null;
      const strings = (value: unknown): string[] =>
        Array.isArray(value)
          ? value.filter((v): v is string => typeof v === "string")
          : [];
      return {
        partyId: party.id,
        displayName: party.display_name,
        expertStatus: party.expert_status,
        headline: party.headline,
        jobTitle: party.job_title,
        confidence:
          research && typeof research.confidence === "number"
            ? research.confidence
            : null,
        credentials: strings(research?.credentials),
        affiliationHints: strings(research?.affiliation_hints),
      };
    });
  } catch (e) {
    console.error(
      "[research] could not load this topic's experts for the resource manifest — the Experts resource will render empty:",
      e,
    );
    return [];
  }
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
    // The wire shape carries `strategy` and `delivery` — dropping either here
    // was D106: a bundle saved with "on demand" delivery reloaded as all-inject,
    // and `strategy: "first"` bundles (Report only) reloaded as concat.
    out.push({
      variable,
      kinds: kinds as BundleBinding["kinds"],
      ...(entry.strategy === "first" || entry.strategy === "concat"
        ? { strategy: entry.strategy }
        : {}),
      ...(entry.delivery === "context" || entry.delivery === "direct"
        ? { delivery: entry.delivery }
        : {}),
    });
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
  // VIEW LAW: container-scoped to this topic + reusable templates
  // (entity_id IS NULL). Never a bare "everything RLS admits".
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
  // 🚨 THE BUNDLE CARRIES ITS ORGANIZATION. `research.rs_context_bundle` is one
  // of the 328 tables carrying `public._stamp_org_default`, so `?? null` filed
  // the bundle in the writer's PERSONAL workspace silently. `ensureOrgId` takes
  // the organization the caller named, else the one the person SELECTED, and
  // THROWS `OrganizationContextError` when there is none — which every surface
  // renders as the "select an organization" notice.
  // common-docs/policies/context-is-carried-never-rebuilt.md
  const organizationId = await ensureOrgId(input.organizationId);
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
    organization_id: organizationId,
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
