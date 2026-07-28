/**
 * app/(core)/marketing/content-plan/create-dense/_lib/service.ts
 *
 * Direct-to-Supabase reads/writes for the archetype console. Per CLAUDE.md's
 * data-flow rule these are pure DB operations, so they go straight to Postgres
 * under RLS — the Python brain is for AI work, not for relaying rows.
 *
 * Node writes delegate to the canonical content-plan service
 * (`features/marketing/content-plan/data/service.ts`) so the trigger contract
 * (route/depth/pillar_label are DB-owned, never sent) holds here too.
 */
import { supabase } from "@/utils/supabase/client";
import {
  authenticatedWebDb,
  requireAuthenticatedSupabaseSession,
} from "@/utils/supabase/webDb";
import { assertData } from "@/features/marketing/data/service";
import { extractErrorMessage } from "@/utils/errors";
import { createPlanNode } from "@/features/marketing/content-plan/data/service";
import type {
  PlanNodeInsert,
  PlanNodeRow,
} from "@/features/marketing/content-plan/types";

import {
  ARCHETYPE_MAP_KEY,
  BUILTIN_ARCHETYPE_VERTICAL,
  NODE_ATTR_KEY,
  SITE_ARCHETYPE_KEY,
  SITE_SETTINGS_KEY,
  flattenSpecs,
  parseArchetypeMap,
  type Archetype,
  type PlanTreeNodeSpec,
} from "./archetypes";

async function planDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("plan");
}

// ── archetype library ──────────────────────────────────────────────────────

export interface ArchetypeLibrary {
  archetypes: Archetype[];
  /** Keys that came from the org's own profile and shadow a builtin. */
  shadowed: string[];
  /** Parse failures, reported instead of silently dropping an archetype. */
  problems: string[];
}

/**
 * The archetype vocabulary visible for a site: the builtin library on the
 * globally-readable system org, plus any archetypes the site's OWN org
 * declares (an org key shadows the builtin of the same name — the server's
 * `load_archetypes` merge order, mirrored).
 */
export async function loadArchetypeLibrary(
  organizationId: string | null,
  signal?: AbortSignal,
): Promise<ArchetypeLibrary> {
  const db = await planDb();
  const abort = signal ?? new AbortController().signal;

  // RLS grants viewer on the system org's row (system_orgs.global_readable),
  // so no org filter is needed — and must not be applied, or the builtin
  // library disappears for every normal org.
  const builtinResponse = await db
    .from("profile")
    .select("*")
    .eq("vertical", BUILTIN_ARCHETYPE_VERTICAL)
    .is("deleted_at", null)
    .abortSignal(abort);
  const builtinRows = assertData(builtinResponse.data, builtinResponse.error);

  let orgRows: typeof builtinRows = [];
  if (organizationId) {
    const orgResponse = await db
      .from("profile")
      .select("*")
      .eq("organization_id", organizationId)
      .neq("vertical", BUILTIN_ARCHETYPE_VERTICAL)
      .is("deleted_at", null)
      .abortSignal(abort);
    orgRows = assertData(orgResponse.data, orgResponse.error);
  }

  const problems: string[] = [];
  const byKey = new Map<string, Archetype>();
  const builtinKeys = new Set<string>();
  const shadowed: string[] = [];

  const ingest = (
    rows: { id: string; vertical: string; template_map: unknown }[],
    tier: "builtin" | "org",
  ) => {
    for (const row of rows) {
      const map =
        row.template_map && typeof row.template_map === "object"
          ? (row.template_map as Record<string, unknown>)[ARCHETYPE_MAP_KEY]
          : null;
      if (!map) continue;
      try {
        for (const archetype of parseArchetypeMap(
          map,
          `plan.profile "${row.vertical}"`,
        )) {
          if (tier === "builtin") builtinKeys.add(archetype.key);
          else if (builtinKeys.has(archetype.key)) shadowed.push(archetype.key);
          byKey.set(archetype.key, archetype);
        }
      } catch (error) {
        problems.push(`plan.profile "${row.vertical}": ${extractErrorMessage(error)}`);
      }
    }
  };

  ingest(builtinRows, "builtin");
  ingest(orgRows, "org");

  return {
    archetypes: [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label)),
    shadowed,
    problems,
  };
}

// ── committed work order (web.site.settings.content_plan.archetype) ────────

export interface CommittedArchetype {
  key: string;
  counts: Record<string, number>;
  instantiatedAt: string | null;
}

/** Read the work order a previous instantiation promised, if any. */
export function readCommittedArchetype(
  settings: unknown,
): CommittedArchetype | null {
  if (!settings || typeof settings !== "object") return null;
  const block = (settings as Record<string, unknown>)[SITE_SETTINGS_KEY];
  if (!block || typeof block !== "object") return null;
  const entry = (block as Record<string, unknown>)[SITE_ARCHETYPE_KEY];
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  if (typeof record.key !== "string") return null;
  const counts: Record<string, number> = {};
  if (record.counts && typeof record.counts === "object") {
    for (const [key, value] of Object.entries(record.counts as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isInteger(value)) counts[key] = value;
    }
  }
  return {
    key: record.key,
    counts,
    instantiatedAt:
      typeof record.instantiated_at === "string" ? record.instantiated_at : null,
  };
}

/**
 * Persist the promised work order on the site — MERGING into
 * `settings.content_plan`, which already carries `vertical` for most sites.
 * Version-checked: a concurrent edit loses nothing silently.
 */
export async function recordSiteArchetype(args: {
  siteId: string;
  expectedVersion: number;
  currentSettings: unknown;
  archetypeKey: string;
  counts: Record<string, number>;
}): Promise<void> {
  const settings =
    args.currentSettings && typeof args.currentSettings === "object"
      ? { ...(args.currentSettings as Record<string, unknown>) }
      : {};
  const block =
    settings[SITE_SETTINGS_KEY] && typeof settings[SITE_SETTINGS_KEY] === "object"
      ? { ...(settings[SITE_SETTINGS_KEY] as Record<string, unknown>) }
      : {};
  block[SITE_ARCHETYPE_KEY] = {
    key: args.archetypeKey,
    counts: args.counts,
    instantiated_at: new Date().toISOString(),
  };
  settings[SITE_SETTINGS_KEY] = block;

  const response = await (await authenticatedWebDb(supabase))
    .from("site")
    .update({ settings })
    .eq("id", args.siteId)
    .eq("version", args.expectedVersion)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (response.error) throw response.error;
  if (!response.data) {
    throw new Error(
      "The site record changed in another session — the pages were created, but the committed counts were not recorded. Refresh and commit again to record them.",
    );
  }
}

// ── instantiation ──────────────────────────────────────────────────────────

export interface InstantiationRow {
  route: string;
  label: string;
  state: "created" | "exists" | "failed";
  error?: string;
}

export interface InstantiationResult {
  created: number;
  existing: number;
  failed: number;
  rows: InstantiationRow[];
}

/**
 * Identity key matching the DB's live unique key `(site_id, parent_id, slug)`.
 * The preview and the writer MUST use this same function, or the dry run can
 * promise "already there" for a row the writer then tries to insert.
 */
export function identityKey(parentId: string | null, slug: string | null): string {
  return `${parentId ?? "~root"}|${slug ?? "~home"}`;
}

/**
 * Apply the expanded tree idempotently. Node identity is the DB's unique key
 * `(site_id, parent_id, slug)`; an existing node is REUSED as the parent for
 * its children and never clobbered — re-running is safe and reports the
 * already-present rows as `exists`.
 *
 * One node's failure fails that subtree only, and the reason (the DB's own
 * message — brandless site, slug shape, duplicate route) is carried out
 * verbatim per row.
 */
export async function instantiateArchetype(args: {
  siteId: string;
  organizationId: string;
  roots: PlanTreeNodeSpec[];
  liveNodes: PlanNodeRow[];
  pageTypeIdBySlug: Map<string, string>;
  statusId: string | null;
  onProgress?: (done: number, total: number) => void;
}): Promise<InstantiationResult> {
  const existingByIdentity = new Map<string, PlanNodeRow>();
  for (const node of args.liveNodes) {
    existingByIdentity.set(identityKey(node.parent_id, node.slug), node);
  }

  const total = flattenSpecs(args.roots).length;
  const rows: InstantiationRow[] = [];
  let created = 0;
  let existing = 0;
  let failed = 0;
  let done = 0;

  const apply = async (spec: PlanTreeNodeSpec, parentId: string | null) => {
    const found = existingByIdentity.get(identityKey(parentId, spec.slug));
    if (found) {
      existing += 1;
      done += 1;
      args.onProgress?.(done, total);
      rows.push({ route: spec.route, label: spec.label, state: "exists" });
      for (const child of spec.children) await apply(child, found.id);
      return;
    }

    const pageTypeId = spec.pageType
      ? (args.pageTypeIdBySlug.get(spec.pageType) ?? null)
      : null;
    const insert: PlanNodeInsert = {
      site_id: args.siteId,
      organization_id: args.organizationId,
      parent_id: parentId,
      node_type: spec.nodeType,
      slug: spec.slug,
      label: spec.label,
      brief: spec.brief,
      attributes: spec.attributes as PlanNodeInsert["attributes"],
      page_type_id: pageTypeId,
      status_id: args.statusId,
    };

    try {
      const node = await createPlanNode(insert);
      created += 1;
      done += 1;
      args.onProgress?.(done, total);
      rows.push({ route: spec.route, label: spec.label, state: "created" });
      for (const child of spec.children) await apply(child, node.id);
    } catch (error) {
      // Supabase rejections are PostgrestError OBJECTS, not Error instances —
      // `String(error)` renders "[object Object]" and throws away the DB's own
      // message, which IS the contract here.
      const message = extractErrorMessage(error);
      const subtree = flattenSpecs([spec]);
      failed += subtree.length;
      done += subtree.length;
      args.onProgress?.(done, total);
      rows.push({
        route: spec.route,
        label: spec.label,
        state: "failed",
        error: message,
      });
      for (const child of subtree.slice(1)) {
        rows.push({
          route: child.route,
          label: child.label,
          state: "failed",
          error: `Parent "${spec.label}" failed.`,
        });
      }
    }
  };

  for (const root of args.roots) await apply(root, null);
  return { created, existing, failed, rows };
}

/** Which live nodes were stamped by an archetype (vs hand-authored). */
export function archetypeStampOf(node: PlanNodeRow): {
  source: string;
  role: string;
  family?: string;
  target_count?: number;
} | null {
  const attributes = node.attributes;
  if (!attributes || typeof attributes !== "object") return null;
  const stamp = (attributes as Record<string, unknown>)[NODE_ATTR_KEY];
  if (!stamp || typeof stamp !== "object") return null;
  const record = stamp as Record<string, unknown>;
  if (typeof record.source !== "string" || typeof record.role !== "string") return null;
  return {
    source: record.source,
    role: record.role,
    family: typeof record.family === "string" ? record.family : undefined,
    target_count:
      typeof record.target_count === "number" ? record.target_count : undefined,
  };
}
