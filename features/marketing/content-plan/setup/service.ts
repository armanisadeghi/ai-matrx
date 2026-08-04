/**
 * features/marketing/content-plan/setup/service.ts
 *
 * The three things the Site Setup view needs that the plan service layer does
 * not already own:
 *
 *  1. the ARCHETYPE LIBRARY — platform builtins (the system-org
 *     `plan.profile` row, `vertical='platform-archetypes'`, globally readable)
 *     merged with the site org's own archetypes, ORG SHADOWING the builtin of
 *     the same key. Same two-tier merge as aidream's `load_archetypes`.
 *  2. the COMMITTED WORK ORDER on `web.site.settings.content_plan.archetype` —
 *     byte-for-byte the shape aidream's `_record_site_archetype` writes
 *     (`{key, counts, instantiated_at}`), so the server-side foundation
 *     checklist and this view read the SAME fact. One source of truth; the
 *     `content_plan` block (which already carries `vertical`) is MERGED, never
 *     replaced. Nothing extra is stored here — an extra key the server does not
 *     write is a second source of truth waiting to drift.
 *  3. the IDEMPOTENT APPLY — node identity is the DB's own unique key
 *     `(site_id, parent_id, slug)`, exactly like aidream's `apply_plan_tree`.
 *
 * Node writes delegate to the canonical plan write path (`createPlanNode`), so
 * the trigger contract (route/depth/pillar_label are DB-owned, never sent)
 * holds here too. Reads go direct to Supabase under RLS — the Python brain is
 * for AI work, not for relaying rows.
 */
import {
  createPlanNode,
  listAllPlanProfiles,
  listPlanNodes,
  updatePlanNode,
} from "@/features/marketing/content-plan/data/service";
import type {
  PlanNodeInsert,
  PlanNodeRow,
} from "@/features/marketing/content-plan/types";
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";
import { extractErrorMessage } from "@/utils/errors";

import {
  ARCHETYPE_MAP_KEY,
  BUILTIN_ARCHETYPE_VERTICAL,
  NODE_ATTR_KEY,
  SITE_ARCHETYPE_KEY,
  SITE_SETTINGS_KEY,
  parseArchetypeMap,
  walkSpec,
  type Archetype,
  type PlanSpecNode,
} from "./archetypes";
import { CONCEPT_MAP_KEY, parseConceptCatalog, type Concept } from "./concepts";

// ── archetype library ──────────────────────────────────────────────────────

export interface ArchetypeLibrary {
  archetypes: Archetype[];
  /**
   * The concept MENU the selection-form archetypes name. Loaded from the SAME
   * profile rows (`template_map.concepts` is the sibling key of `.archetypes`)
   * — an archetype selection is meaningless without it, and two sources would
   * create a partial-load state where a shape references a concept nobody read.
   */
  catalog: Record<string, Concept>;
  /** Keys an org profile overrode — said out loud, never silently hidden. */
  shadowed: string[];
  /** Parse failures + loud recoveries, surfaced instead of swallowed. */
  problems: string[];
}

/**
 * A malformed org archetype does NOT hide the builtins — it is reported beside
 * them (loud recovery), because losing the whole library to one bad row is
 * worse than showing the rest with a warning.
 */
export async function loadArchetypeLibrary(
  organizationId: string | null,
  signal?: AbortSignal,
): Promise<ArchetypeLibrary> {
  const profiles = await listAllPlanProfiles(signal);

  const problems: string[] = [];
  const byKey = new Map<string, Archetype>();
  const builtinKeys = new Set<string>();
  const shadowed: string[] = [];
  const catalog: Record<string, Concept> = {};

  const ingest = (
    rows: typeof profiles,
    tier: "builtin" | "org",
    source: (vertical: string) => string,
  ) => {
    for (const row of rows) {
      const templateMap =
        row.template_map && typeof row.template_map === "object"
          ? (row.template_map as Record<string, unknown>)
          : null;
      if (!templateMap) continue;

      // Concepts first: the catalog must be in hand before any selection that
      // names it is resolved. An org profile shadows INDIVIDUAL concept keys,
      // exactly the way it shadows individual archetype keys.
      // Degrades PER CONCEPT (Arman, 2026-07-29, after a live break): one
      // malformed or newer-schema concept is skipped + screamed about, never
      // allowed to kill the whole menu.
      const conceptsRaw = templateMap[CONCEPT_MAP_KEY];
      if (
        conceptsRaw !== null &&
        conceptsRaw !== undefined &&
        typeof conceptsRaw === "object" &&
        !Array.isArray(conceptsRaw)
      ) {
        for (const [conceptKey, value] of Object.entries(
          conceptsRaw as Record<string, unknown>,
        )) {
          try {
            Object.assign(
              catalog,
              parseConceptCatalog(
                { [conceptKey]: value },
                `plan.profile "${row.vertical}"`,
                problems,
              ),
            );
          } catch (error) {
            problems.push(
              `plan.profile "${row.vertical}" concept "${conceptKey}" skipped: ${extractErrorMessage(error)}`,
            );
          }
        }
      } else if (conceptsRaw !== null && conceptsRaw !== undefined) {
        problems.push(
          `plan.profile "${row.vertical}" concepts: expected an object keyed by concept name.`,
        );
      }

      const map = templateMap[ARCHETYPE_MAP_KEY];
      if (map === null || map === undefined) continue;
      try {
        for (const archetype of parseArchetypeMap(
          map,
          `plan.profile "${row.vertical}"`,
          source(row.vertical),
          problems,
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

  // Builtins first so an org archetype of the same key shadows it.
  ingest(
    profiles.filter((row) => row.vertical === BUILTIN_ARCHETYPE_VERTICAL),
    "builtin",
    () => "builtin",
  );
  if (organizationId) {
    ingest(
      profiles.filter(
        (row) =>
          row.organization_id === organizationId &&
          row.vertical !== BUILTIN_ARCHETYPE_VERTICAL,
      ),
      "org",
      (vertical) => vertical,
    );
  }

  // Smallest shape first. The list reads as a ladder ("how big is this site?"),
  // which is the actual question; alphabetical would land a brand-new site on
  // "Authority base — 100 to 1000 pages", and people scale up, not down.
  const size = (archetype: Archetype) => {
    const match = /\d+/.exec(archetype.pageEstimate);
    return match ? Number.parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER;
  };

  return {
    archetypes: [...byKey.values()].sort(
      (a, b) => size(a) - size(b) || a.label.localeCompare(b.label),
    ),
    catalog,
    shadowed,
    problems,
  };
}

// ── committed work order (web.site.settings.content_plan.archetype) ────────

export interface CommittedArchetype {
  key: string;
  counts: Record<string, number>;
  /** Chosen display names per concept (naming enums — slug followed them). */
  conceptNames: Record<string, string>;
  instantiatedAt: string | null;
}

/** The work order a previous instantiation (here OR the chat tool) promised. */
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
  const conceptNames: Record<string, string> = {};
  if (record.concept_names && typeof record.concept_names === "object") {
    for (const [key, value] of Object.entries(
      record.concept_names as Record<string, unknown>,
    )) {
      if (typeof value === "string" && value.trim()) conceptNames[key] = value;
    }
  }
  return {
    key: record.key,
    counts,
    conceptNames,
    instantiatedAt:
      typeof record.instantiated_at === "string" ? record.instantiated_at : null,
  };
}

/**
 * Persist the promised work order on the site, MERGING into
 * `settings.content_plan`. PostgREST has no partial-jsonb update, so this is a
 * read-modify-write — guarded by the row's `version` so a concurrent edit to
 * another settings key loses nothing silently (it fails loudly instead).
 */
export async function recordSiteArchetype(args: {
  siteId: string;
  expectedVersion: number;
  currentSettings: unknown;
  archetypeKey: string;
  counts: Record<string, number>;
  /** Chosen display names (naming enums); omitted from the record when empty —
   * byte-for-byte what aidream's `_record_site_archetype` writes. */
  conceptNames?: Record<string, string>;
}): Promise<void> {
  const settings =
    args.currentSettings && typeof args.currentSettings === "object"
      ? { ...(args.currentSettings as Record<string, unknown>) }
      : {};
  const block =
    settings[SITE_SETTINGS_KEY] && typeof settings[SITE_SETTINGS_KEY] === "object"
      ? { ...(settings[SITE_SETTINGS_KEY] as Record<string, unknown>) }
      : {};
  const entry: Record<string, unknown> = {
    key: args.archetypeKey,
    counts: args.counts,
    instantiated_at: new Date().toISOString(),
  };
  if (args.conceptNames && Object.keys(args.conceptNames).length > 0) {
    entry.concept_names = args.conceptNames;
  }
  block[SITE_ARCHETYPE_KEY] = entry;
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

// ── idempotent apply ───────────────────────────────────────────────────────

export interface CommitRow {
  route: string;
  label: string;
  state: "created" | "exists" | "failed";
  /** The DB's own message, verbatim — it IS the contract. */
  error?: string;
}

export interface CommitResult {
  created: number;
  existing: number;
  failed: number;
  rows: CommitRow[];
  /** Loud: a created row whose DB-computed route differs from the preview. */
  routeMismatches: { expected: string; actual: string }[];
}

/**
 * Identity key matching the DB's live unique index
 * `node_site_parent_slug_key (site_id, parent_id, slug) NULLS NOT DISTINCT`.
 *
 * THE PREVIEW AND THE WRITER MUST USE THIS SAME FUNCTION. Diffing by route
 * while writing by (parent, slug) is how a dry run promises "already there" for
 * a row the writer then tries to insert — and how a route collision under a
 * DIFFERENT parent (rejected by the second unique index `node_site_route_key`)
 * only shows up as a post-commit failure.
 */
export function identityKey(parentId: string | null, slug: string | null): string {
  return `${parentId ?? "~root"}|${slug ?? "~home"}`;
}

/**
 * Apply the expanded tree idempotently. An existing node is REUSED as the
 * parent for its children and never clobbered — re-running is safe and reports
 * the already-present rows as `exists`. That is what makes this work on a
 * HALF-BUILT site, not just a blank one.
 *
 * One node's failure fails that subtree only, and every skipped descendant is
 * reported explicitly rather than silently dropped.
 */
export async function commitArchetype(args: {
  siteId: string;
  organizationId: string;
  roots: PlanSpecNode[];
  liveNodes: PlanNodeRow[];
  pageTypeIdBySlug: Map<string, string>;
  statusId: string | null;
  onProgress?: (done: number, total: number) => void;
}): Promise<CommitResult> {
  const existingByIdentity = new Map<string, PlanNodeRow>();
  for (const node of args.liveNodes) {
    existingByIdentity.set(identityKey(node.parent_id, node.slug), node);
  }

  const total = walkSpec(args.roots).length;
  const rows: CommitRow[] = [];
  const routeMismatches: { expected: string; actual: string }[] = [];
  let created = 0;
  let existing = 0;
  let failed = 0;
  let done = 0;

  const apply = async (spec: PlanSpecNode, parentId: string | null) => {
    const found = existingByIdentity.get(identityKey(parentId, spec.slug));
    if (found) {
      existing += 1;
      done += 1;
      args.onProgress?.(done, total);
      rows.push({ route: spec.route, label: spec.label, state: "exists" });
      for (const child of spec.children) await apply(child, found.id);
      return;
    }

    const insert: PlanNodeInsert = {
      site_id: args.siteId,
      organization_id: args.organizationId,
      parent_id: parentId,
      node_type: spec.nodeType,
      slug: spec.slug,
      label: spec.label,
      brief: spec.brief,
      attributes: spec.attributes as PlanNodeInsert["attributes"],
      page_type_id: spec.pageType
        ? (args.pageTypeIdBySlug.get(spec.pageType) ?? null)
        : null,
      status_id: args.statusId,
    };

    try {
      const node = await createPlanNode(insert);
      created += 1;
      done += 1;
      args.onProgress?.(done, total);
      rows.push({ route: spec.route, label: spec.label, state: "created" });
      if (node.route && node.route !== spec.route) {
        // The DB is the authority on routes; a divergence means the preview
        // lied to the user. Never silent.
        routeMismatches.push({ expected: spec.route, actual: node.route });
      }
      for (const child of spec.children) await apply(child, node.id);
    } catch (error) {
      // Supabase rejections are PostgrestError OBJECTS, not Error instances —
      // `String(error)` renders "[object Object]" and throws away the DB's own
      // message, which IS the contract here.
      const message = extractErrorMessage(error);
      const subtree = walkSpec([spec]);
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
  return { created, existing, failed, rows, routeMismatches };
}

/** One family's recorded topic work order: the hub route + its titles. */
export interface FamilyTopicOrder {
  familyKey: string;
  /** The hub node's route as the expansion computed it (e.g. `/blog`). */
  hubRoute: string;
  label: string;
  topics: string[];
}

export interface TopicApplyResult {
  applied: number;
  /** Families whose hub node was not found (never committed yet). */
  missing: string[];
  failures: string[];
}

/**
 * Record COUNT-ONLY families' article titles on their hub node's brief.
 *
 * A count-only family (blog / guides / learn) materializes only its hub —
 * "the count is the commitment and the titles come from research". This is
 * where the researched titles become that recorded work order, so the
 * generator and the writers downstream know exactly what to write.
 *
 * The hub node is found by ROUTE (trigger-owned and unique per site), and the
 * brief is REPLACED with a stable marker block so re-applying is idempotent
 * and never duplicates lines. Any non-topic brief lines the user wrote are
 * preserved above the block.
 */
export const TOPIC_BRIEF_MARKER = "Planned topics (from research):";

export function composeTopicBrief(
  existingBrief: string[] | null,
  topics: string[],
): string[] {
  const kept: string[] = [];
  for (const line of existingBrief ?? []) {
    if (line.trim() === TOPIC_BRIEF_MARKER) break;
    kept.push(line);
  }
  if (topics.length === 0) return kept;
  return [...kept, TOPIC_BRIEF_MARKER, ...topics.map((topic) => `- ${topic}`)];
}

export async function applyFamilyTopics(args: {
  siteId: string;
  orders: FamilyTopicOrder[];
}): Promise<TopicApplyResult> {
  const orders = args.orders.filter((order) => order.topics.length > 0);
  if (orders.length === 0) return { applied: 0, missing: [], failures: [] };

  const liveNodes = await listPlanNodes(args.siteId);
  const byRoute = new Map<string, PlanNodeRow>();
  for (const node of liveNodes) {
    if (node.route) byRoute.set(node.route, node);
  }

  let applied = 0;
  const missing: string[] = [];
  const failures: string[] = [];
  for (const order of orders) {
    const hub = byRoute.get(order.hubRoute);
    if (!hub) {
      missing.push(order.label);
      continue;
    }
    try {
      await updatePlanNode(hub.id, {
        brief: composeTopicBrief(hub.brief, order.topics),
      });
      applied += 1;
    } catch (error) {
      failures.push(`${order.label}: ${extractErrorMessage(error)}`);
    }
  }
  return { applied, missing, failures };
}

/** Every `plan_page_type` slug the work order needs — checked BEFORE any write. */
export function missingPageTypes(
  roots: PlanSpecNode[],
  pageTypeIdBySlug: Map<string, string>,
): string[] {
  const missing = new Set<string>();
  for (const node of walkSpec(roots)) {
    if (node.pageType && !pageTypeIdBySlug.has(node.pageType)) {
      missing.add(node.pageType);
    }
  }
  return [...missing].sort();
}

/** Which live nodes were stamped by an archetype (vs hand-authored). */
export function archetypeStampOf(node: PlanNodeRow): {
  source: string;
  role: string;
  family?: string;
  targetCount?: number;
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
    targetCount:
      typeof record.target_count === "number" ? record.target_count : undefined,
  };
}
