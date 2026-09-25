// features/kits/service.ts — reading kits from the catalog.
//
// A kit is one `public.catalog_entries` row (app 'matrx', kind 'kit'); the list is
// read straight from Supabase (CLAUDE.md § Data flow — a plain DB read, never the
// Python server). The Supabase client is passed in so a Server Component and the
// browser read the SAME function.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { KIT_CATALOG } from "./constants";
import type { KitEntry, KitManifest } from "./types";

type Client = SupabaseClient<Database>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * The manifest, read defensively. A row that is not a kit is SKIPPED and
 * SCREAMS (a catalog row failing its own shape is a data defect, never a blank
 * card) — it is not repaired or guessed at.
 */
export function parseKitManifest(key: string, payload: unknown): KitManifest | null {
  const fail = (why: string) => {
    console.error(`[kits] catalog kit '${key}' is not a valid kit manifest — skipped: ${why}`);
    return null;
  };
  if (!isRecord(payload)) return fail("payload is not an object");
  const p = payload;
  if (typeof p.name !== "string" || !p.name) return fail("name is missing");
  if (!Array.isArray(p.tables)) return fail("tables is not a list");
  if (!Array.isArray(p.agents)) return fail("agents is not a list");
  for (const t of p.tables) {
    if (!isRecord(t) || typeof t.key !== "string" || typeof t.name !== "string" || !Array.isArray(t.fields)) {
      return fail("a table has no key, name or fields");
    }
  }
  for (const a of p.agents) {
    if (!isRecord(a) || typeof a.key !== "string" || typeof a.source_agent_id !== "string") {
      return fail("an agent has no key or source_agent_id");
    }
  }
  const version =
    typeof p.version === "number"
      ? p.version
      : typeof p.schema_version === "number"
        ? p.schema_version
        : 1;
  return {
    ...(p as unknown as KitManifest),
    key: typeof p.key === "string" && p.key ? p.key : key,
    version,
    tagline: typeof p.tagline === "string" ? p.tagline : "",
    description: typeof p.description === "string" ? p.description : "",
    category: typeof p.category === "string" && p.category ? p.category : "General",
    icon: typeof p.icon === "string" ? p.icon : "Package",
    teaches: Array.isArray(p.teaches) ? p.teaches.filter((x): x is string => typeof x === "string") : [],
    workflows: Array.isArray(p.workflows) ? (p.workflows as KitManifest["workflows"]) : [],
    guide: Array.isArray(p.guide) ? (p.guide as KitManifest["guide"]) : [],
    tables: (p.tables as KitManifest["tables"]).map((t) => ({
      ...t,
      records: Array.isArray(t.records) ? t.records : [],
    })),
    agents: (p.agents as KitManifest["agents"]).map((a) => ({
      ...a,
      bindings: Array.isArray(a.bindings) ? a.bindings : [],
    })),
  };
}

export interface KitsRead {
  kits: KitEntry[];
  error: string | null;
}

/**
 * The active kits ONE organization publishes (THE VIEW LAW: every list declares its
 * own scope — never "whatever RLS lets me see", which for a platform admin is every
 * organization's kits). The platform's kits are the system organization's.
 */
export async function fetchKits(client: Client, organizationId: string): Promise<KitsRead> {
  const { data, error } = await client
    .from("catalog_entries")
    .select("key, payload, sort_order, organization_id, created_by")
    .eq("app", KIT_CATALOG.app)
    .eq("kind", KIT_CATALOG.kind)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("key", { ascending: true });
  if (error) return { kits: [], error: error.message };
  const kits: KitEntry[] = [];
  for (const row of data ?? []) {
    const manifest = parseKitManifest(row.key, row.payload);
    if (manifest) {
      kits.push({
        key: row.key,
        sortOrder: row.sort_order ?? 0,
        manifest,
        organizationId: row.organization_id,
        createdBy: row.created_by,
      });
    }
  }
  return { kits, error: null };
}

export async function fetchKit(
  client: Client,
  key: string,
): Promise<{ kit: KitEntry | null; error: string | null; inactive?: boolean }> {
  const { data, error } = await client
    .from("catalog_entries")
    .select("key, payload, sort_order, organization_id, created_by, is_active")
    .eq("app", KIT_CATALOG.app)
    .eq("kind", KIT_CATALOG.kind)
    .eq("key", key)
    .maybeSingle();
  if (error) return { kit: null, error: error.message };
  if (!data) return { kit: null, error: null };
  // Taken out of the gallery: said plainly by the page, never a "no such kit".
  if (!data.is_active) return { kit: null, error: null, inactive: true };
  const manifest = parseKitManifest(data.key, data.payload);
  if (!manifest) {
    return { kit: null, error: `The catalog entry for "${key}" is not a valid kit manifest.` };
  }
  return {
    kit: {
      key: data.key,
      sortOrder: data.sort_order ?? 0,
      manifest,
      organizationId: data.organization_id,
      createdBy: data.created_by,
    },
    error: null,
  };
}

/** The fork's source agents, by id — name + description for the detail page's agent card. */
export async function fetchSourceAgents(
  client: Client,
  ids: string[],
): Promise<Record<string, { id: string; name: string; description: string | null }>> {
  if (ids.length === 0) return {};
  const { data, error } = await client
    .schema("agent")
    .from("definition")
    .select("id, name, description")
    .in("id", ids);
  if (error) {
    console.error("[kits] could not read the kit's source agents", error.message);
    return {};
  }
  const out: Record<string, { id: string; name: string; description: string | null }> = {};
  for (const row of data ?? []) out[row.id] = row;
  return out;
}

/** Every `{token, id}` entity reference in a kit's example rows. */
export function entityRefsIn(manifest: KitManifest): { token: string; id: string }[] {
  const out = new Map<string, { token: string; id: string }>();
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (isRecord(v) && typeof v.token === "string" && typeof v.id === "string") {
      out.set(`${v.token}:${v.id}`, { token: v.token, id: v.id });
    }
  };
  for (const t of manifest.tables) for (const r of t.records) Object.values(r).forEach(visit);
  return [...out.values()];
}

/**
 * Names for the entity references a kit's example rows point at, keyed `token:id`,
 * so a preview says "Gemini 3.8 Flash" rather than an id. Only tokens with a known
 * name source are resolved; any other reference is shown by its registry icon + id.
 */
export async function fetchRefNames(
  client: Client,
  refs: { token: string; id: string }[],
): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  const modelIds = refs.filter((r) => r.token === "ai_model").map((r) => r.id);
  if (modelIds.length > 0) {
    const { data, error } = await client
      .schema("ai")
      .from("model_definition")
      .select("id, name, common_name")
      .in("id", modelIds);
    if (error) console.error("[kits] could not read AI model names for the preview", error.message);
    for (const m of data ?? []) names[`ai_model:${m.id}`] = m.common_name || m.name;
  }
  return names;
}
