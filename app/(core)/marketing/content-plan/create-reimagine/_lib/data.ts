"use client";

/**
 * Data layer for the Blueprint Bench.
 *
 * Everything here is a DIRECT browser read/write (CLAUDE.md data-flow rule) —
 * `plan.profile` for the archetype library, `plan.node` via the existing
 * content-plan service for the tree, `web.site` for the committed work order.
 * The ONE exception is the CMS side of the readiness ledger: the CMS lives in a
 * second Supabase project reachable only through the existing `/api/cms/*`
 * seam, so we consume that seam rather than opening a second CMS path.
 */
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { createPlanNode } from "@/features/marketing/content-plan/data/service";
import type {
  PlanNodeInsert,
  PlanNodeRow,
} from "@/features/marketing/content-plan/types";
import type { MarketingSite } from "@/features/marketing/types";
import type { Json } from "@/types/database.types";

import {
  ArchetypeError,
  parseArchetypeMap,
  type Archetype,
  type ExpandedArchetype,
  type PlannedNode,
} from "./archetypes";

/** `plan.profile.vertical` of the system-org row carrying the builtin library. */
export const BUILTIN_ARCHETYPE_VERTICAL = "platform-archetypes";
/** `web.site.settings` key where an instantiation records the promised work order. */
export const SITE_SETTINGS_KEY = "content_plan";

// ── archetype library ───────────────────────────────────────────────────────

export interface ArchetypeLibrary {
  archetypes: Archetype[];
  /** Malformed profile rows, reported instead of silently skipped. */
  problems: string[];
}

/**
 * Every archetype the caller can see, builtin first, org rows SHADOWING a
 * builtin of the same key. RLS is the ceiling: the builtin row is
 * `visibility='public'` on the system org, org rows come through membership.
 */
export async function loadArchetypeLibrary(
  organizationId: string | null,
  signal?: AbortSignal,
): Promise<ArchetypeLibrary> {
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("plan")
    .from("profile")
    .select("id, vertical, organization_id, template_map")
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw new Error(response.error.message);

  const problems: string[] = [];
  const builtin = new Map<string, Archetype>();
  const org = new Map<string, Archetype>();

  for (const row of response.data ?? []) {
    const map = (row.template_map as Record<string, unknown> | null)?.archetypes;
    if (map === undefined || map === null) continue;
    const isBuiltin = row.vertical === BUILTIN_ARCHETYPE_VERTICAL;
    // Org rows only shadow for the org actually in context — another org's
    // profile must never redefine the archetype this site instantiates.
    if (!isBuiltin && organizationId && row.organization_id !== organizationId) {
      continue;
    }
    try {
      const parsed = parseArchetypeMap(
        map,
        `plan.profile[${row.vertical}]`,
        isBuiltin ? "builtin" : "org",
      );
      for (const archetype of parsed) {
        (isBuiltin ? builtin : org).set(archetype.key, archetype);
      }
    } catch (error) {
      problems.push(
        error instanceof ArchetypeError || error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }

  const merged = new Map(builtin);
  for (const [key, archetype] of org) merged.set(key, archetype);
  return {
    archetypes: [...merged.values()].sort((a, b) => a.label.localeCompare(b.label)),
    problems,
  };
}

// ── the plan diff ───────────────────────────────────────────────────────────

export type RouteState = "new" | "exists";

export interface ManifestRow {
  node: PlannedNode;
  state: RouteState;
  /** The live plan node occupying this route, when it already exists. */
  existing: PlanNodeRow | null;
  depth: number;
}

export interface ExtraRow {
  node: PlanNodeRow;
  route: string;
}

export interface PlanDiff {
  rows: ManifestRow[];
  extra: ExtraRow[];
  newCount: number;
  existsCount: number;
  /** Total live pages after a commit (existing plan ∪ archetype). */
  totalAfter: number;
  byRoute: Map<string, PlanNodeRow>;
}

export function diffAgainstPlan(
  expanded: ExpandedArchetype,
  nodes: PlanNodeRow[],
): PlanDiff {
  const byRoute = new Map<string, PlanNodeRow>();
  for (const node of nodes) {
    if (node.route) byRoute.set(node.route, node);
  }

  const rows: ManifestRow[] = [];
  const depthOf = (route: string) =>
    route === "/" ? 0 : route.split("/").filter(Boolean).length;
  for (const node of expanded.flat) {
    const existing = byRoute.get(node.route) ?? null;
    rows.push({
      node,
      state: existing ? "exists" : "new",
      existing,
      depth: depthOf(node.route),
    });
  }

  const plannedRoutes = new Set(expanded.flat.map((node) => node.route));
  const extra: ExtraRow[] = nodes
    .filter((node) => node.route && !plannedRoutes.has(node.route))
    .map((node) => ({ node, route: node.route as string }))
    .sort((a, b) => a.route.localeCompare(b.route));

  const newCount = rows.filter((row) => row.state === "new").length;
  return {
    rows,
    extra,
    newCount,
    existsCount: rows.length - newCount,
    totalAfter: nodes.length + newCount,
    byRoute,
  };
}

// ── commit ─────────────────────────────────────────────────────────────────

export interface CommitProgress {
  created: number;
  skipped: number;
  total: number;
  currentRoute: string | null;
}

export interface CommitArgs {
  site: MarketingSite;
  expanded: ExpandedArchetype;
  existingByRoute: Map<string, PlanNodeRow>;
  /** plan_page_type category slug -> category id. Missing slugs are reported. */
  pageTypeIds: Map<string, string>;
  onProgress: (progress: CommitProgress) => void;
}

export interface CommitResult {
  created: number;
  skipped: number;
  createdRoutes: string[];
  /** page_type slugs the archetype declares that no category matches. */
  unmappedPageTypes: string[];
}

/**
 * Create every missing node, parents first. Idempotent by route: a route that
 * already exists is REUSED as the parent and never rewritten — re-running after
 * a failure resumes exactly where it stopped.
 *
 * DB errors (brandless site, duplicate route, slug shape) are the contract:
 * they abort the run and surface verbatim. Whatever landed stays landed and the
 * next run skips it.
 */
export async function commitArchetype(args: CommitArgs): Promise<CommitResult> {
  const { site, expanded, existingByRoute, pageTypeIds, onProgress } = args;
  const total = expanded.flat.length;
  const unmapped = new Set<string>();
  const createdRoutes: string[] = [];
  let created = 0;
  let skipped = 0;

  const idByRoute = new Map<string, string>();
  for (const [route, node] of existingByRoute) idByRoute.set(route, node.id);

  const walk = async (node: PlannedNode, parentRoute: string | null) => {
    onProgress({ created, skipped, total, currentRoute: node.route });
    const alreadyThere = idByRoute.get(node.route);
    if (alreadyThere) {
      skipped += 1;
    } else {
      if (node.pageType && !pageTypeIds.has(node.pageType)) {
        unmapped.add(node.pageType);
      }
      const insert: PlanNodeInsert = {
        site_id: site.id,
        organization_id: site.organization_id,
        parent_id: parentRoute ? (idByRoute.get(parentRoute) ?? null) : null,
        label: node.label,
        slug: node.slug,
        node_type: node.nodeType,
        page_type_id: node.pageType
          ? (pageTypeIds.get(node.pageType) ?? null)
          : null,
        brief: node.brief,
        attributes: node.attributes as Json,
      };
      const row = await createPlanNode(insert);
      idByRoute.set(node.route, row.id);
      createdRoutes.push(node.route);
      created += 1;
    }
    onProgress({ created, skipped, total, currentRoute: node.route });
    for (const child of node.children) await walk(child, node.route);
  };

  await walk(expanded.root, null);
  onProgress({ created, skipped, total, currentRoute: null });
  return {
    created,
    skipped,
    createdRoutes,
    unmappedPageTypes: [...unmapped].sort(),
  };
}

// ── the committed work order (web.site.settings.content_plan) ───────────────

export interface CommittedWorkOrder {
  archetype: string | null;
  counts: Record<string, number>;
  names: Record<string, string[]>;
  committedAt: string | null;
}

export function readWorkOrder(site: MarketingSite | null): CommittedWorkOrder {
  const settings = (site?.settings ?? null) as Record<string, unknown> | null;
  const block = settings?.[SITE_SETTINGS_KEY] as Record<string, unknown> | undefined;
  const counts: Record<string, number> = {};
  const rawCounts = block?.counts;
  if (rawCounts && typeof rawCounts === "object" && !Array.isArray(rawCounts)) {
    for (const [key, value] of Object.entries(rawCounts)) {
      if (typeof value === "number" && Number.isInteger(value)) counts[key] = value;
    }
  }
  const names: Record<string, string[]> = {};
  const rawNames = block?.names;
  if (rawNames && typeof rawNames === "object" && !Array.isArray(rawNames)) {
    for (const [key, value] of Object.entries(rawNames)) {
      if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        names[key] = value as string[];
      }
    }
  }
  return {
    archetype: typeof block?.archetype === "string" ? block.archetype : null,
    counts,
    names,
    committedAt:
      typeof block?.committed_at === "string" ? block.committed_at : null,
  };
}

/**
 * Record what was promised, so the readiness checklist is PERSISTENT — every
 * later visit measures against the archetype + counts actually committed, not
 * against whatever the picker happens to show.
 */
export async function saveWorkOrder(args: {
  site: MarketingSite;
  archetypeKey: string;
  counts: Record<string, number>;
  names: Record<string, string[]>;
}): Promise<void> {
  await requireAuthenticatedSupabaseSession(supabase);
  const settings = { ...((args.site.settings ?? {}) as Record<string, unknown>) };
  const previous = (settings[SITE_SETTINGS_KEY] ?? {}) as Record<string, unknown>;
  settings[SITE_SETTINGS_KEY] = {
    ...previous,
    archetype: args.archetypeKey,
    counts: args.counts,
    names: args.names,
    committed_at: new Date().toISOString(),
  };
  const response = await supabase
    .schema("web")
    .from("site")
    .update({ settings: settings as Json })
    .eq("id", args.site.id)
    .is("deleted_at", null)
    .select("id");
  if (response.error) throw new Error(response.error.message);
  if (!response.data || response.data.length === 0) {
    throw new Error(
      "The plan was created, but recording the work order on the site failed — " +
        "the site row was not writable. The readiness checklist will fall back to the picker.",
    );
  }
}

// ── CMS side of the readiness ledger ────────────────────────────────────────

export interface CmsLink {
  linked: boolean;
  cmsSiteId: string | null;
  cmsSlug: string | null;
  matchedBy: string | null;
  reason: string | null;
}

export interface CmsActuals {
  themeKeys: string[];
  hasGlobalCss: boolean;
  /** -1 = navigation is a shape we refuse to guess at. */
  navCount: number;
  navDetail: string;
  components: { componentType: string; name: string }[];
  assets: { fileName: string; folder: string; tags: string[] }[];
  pageCount: number;
}

export interface CmsReadiness {
  link: CmsLink;
  actuals: CmsActuals | null;
}

function normalizeDomain(domain: string | null | undefined): string {
  if (!domain) return "";
  let text = domain.trim().toLowerCase();
  for (const prefix of ["https://", "http://"]) {
    if (text.startsWith(prefix)) text = text.slice(prefix.length);
  }
  if (text.startsWith("www.")) text = text.slice(4);
  return text.replace(/\/+$/, "");
}

async function cmsApi<T>(
  endpoint: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/cms/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `CMS API error: ${response.status}`);
  }
  return data;
}

function navEntryCount(navigation: unknown): [number, string] {
  if (Array.isArray(navigation)) return [navigation.length, "navigation[]"];
  if (navigation && typeof navigation === "object") {
    const record = navigation as Record<string, unknown>;
    for (const key of ["items", "links", "main", "primary"]) {
      const value = record[key];
      if (Array.isArray(value)) return [value.length, `navigation.${key}[]`];
    }
    const keys = Object.keys(record).sort().slice(0, 6);
    if (keys.length === 0) return [0, "navigation is empty"];
    return [-1, `navigation is an object with keys ${keys.join(", ")} — no list found`];
  }
  if (navigation === null || navigation === undefined) {
    return [0, "navigation is not set"];
  }
  return [-1, `navigation is a ${typeof navigation}, not a list or object`];
}

/**
 * What actually exists on the CMS side. A site with no CMS counterpart returns
 * `linked: false` with the reason — "nothing built" must read as nothing built,
 * never as an error and never as a fabricated zero.
 */
export async function loadCmsReadiness(
  site: MarketingSite,
  signal?: AbortSignal,
): Promise<CmsReadiness> {
  const override = ((site.settings ?? {}) as Record<string, unknown>).cms as
    | Record<string, unknown>
    | undefined;

  const sitesResponse = await cmsApi<{
    sites: { id: string; slug: string; domain: string | null }[];
  }>("sites", { action: "list" }, signal);

  let match: { id: string; slug: string } | null = null;
  let matchedBy: string | null = null;
  let reason: string | null = null;

  if (typeof override?.site_id === "string") {
    const found = sitesResponse.sites.find((s) => s.id === override.site_id);
    if (found) {
      match = found;
      matchedBy = "settings.cms.site_id";
    } else {
      reason = `settings.cms.site_id ${String(override.site_id)} is not a CMS site you own.`;
    }
  } else if (typeof override?.slug === "string") {
    const found = sitesResponse.sites.find((s) => s.slug === override.slug);
    if (found) {
      match = found;
      matchedBy = "settings.cms.slug";
    } else {
      reason = `settings.cms.slug ${String(override.slug)} does not exist in the CMS.`;
    }
  } else {
    const domain = normalizeDomain(site.domain);
    if (!domain) {
      reason = "This site has no domain to match a CMS site on.";
    } else {
      const found = sitesResponse.sites.find(
        (s) => normalizeDomain(s.domain) === domain,
      );
      if (found) {
        match = found;
        matchedBy = "domain";
      } else {
        reason = `No CMS site you own matches ${domain}. Set settings.cms.slug to link them explicitly.`;
      }
    }
  }

  if (!match) {
    return {
      link: { linked: false, cmsSiteId: null, cmsSlug: null, matchedBy: null, reason },
      actuals: null,
    };
  }

  const [detail, components, assets, pages] = await Promise.all([
    cmsApi<{
      site: {
        theme_config: Record<string, unknown> | null;
        global_css: string | null;
        navigation: unknown;
      };
    }>("sites", { action: "get", siteId: match.id }, signal),
    cmsApi<{
      components: { component_type: string; name: string; is_active: boolean }[];
    }>("components", { action: "list", siteId: match.id }, signal),
    cmsApi<{
      assets: {
        file_name: string;
        folder: string | null;
        tags: string[] | null;
        is_active: boolean;
      }[];
    }>("assets", { action: "list", siteId: match.id }, signal),
    cmsApi<{ pages: unknown[] }>(
      "pages",
      { action: "list", siteId: match.id },
      signal,
    ).catch(() => ({ pages: [] })),
  ]);

  const [navCount, navDetail] = navEntryCount(detail.site?.navigation);
  const theme = detail.site?.theme_config;
  return {
    link: {
      linked: true,
      cmsSiteId: match.id,
      cmsSlug: match.slug,
      matchedBy,
      reason: null,
    },
    actuals: {
      themeKeys:
        theme && typeof theme === "object" ? Object.keys(theme).sort() : [],
      hasGlobalCss: Boolean((detail.site?.global_css ?? "").trim()),
      navCount,
      navDetail,
      components: components.components
        .filter((c) => c.is_active !== false)
        .map((c) => ({ componentType: c.component_type ?? "", name: c.name ?? "" })),
      assets: assets.assets
        .filter((a) => a.is_active !== false)
        .map((a) => ({
          fileName: a.file_name ?? "",
          folder: a.folder ?? "",
          tags: a.tags ?? [],
        })),
      pageCount: Array.isArray(pages.pages) ? pages.pages.length : 0,
    },
  };
}
