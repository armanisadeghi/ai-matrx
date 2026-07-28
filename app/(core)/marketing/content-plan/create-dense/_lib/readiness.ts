/**
 * app/(core)/marketing/content-plan/create-dense/_lib/readiness.ts
 *
 * The persistent readiness checklist — "how much of what this site needs
 * actually exists?" It is NOT a day-zero wizard step: it answers the same
 * question on an empty site, a half-built one, and a finished one.
 *
 * Two halves, both real:
 *
 *  - **Plan side** (main Supabase project, direct) — the brand gate, core
 *    pages, and per-family coverage, measured against `plan.node`.
 *  - **CMS side** (project `viyklljfdhtidwecakwx`, via the existing
 *    `/api/cms/*` seam) — the design tokens, header/footer components, primary
 *    nav entries, and assets the archetype's `foundation` block declares.
 *
 * When a site has no CMS counterpart the checklist still returns: every CMS
 * item reads `unknown` with an explicit reason. A site with nothing built must
 * read as "nothing built" — never as an error, and never as a false "met".
 * Mirrors `aidream/aidream/services/content_plan/foundation.py`.
 */
import type { ClientAsset, ClientComponent, ClientSite } from "@/features/cms/types";
import type { PlanNodeRow } from "@/features/marketing/content-plan/types";

import type { ExpandedArchetype, FoundationRequirement } from "./archetypes";

export type ItemState = "met" | "partial" | "unmet" | "unknown";

export interface ChecklistItem {
  key: string;
  group: "gate" | "pages" | "foundation";
  label: string;
  required: number;
  actual: number;
  state: ItemState;
  /** Where the number came from (`=services.count`, `navigation[]`, …). */
  detail: string;
}

export interface FamilyCoverage {
  key: string;
  label: string;
  route: string;
  targetCount: number;
  plannedCount: number;
}

export interface CmsLink {
  linked: boolean;
  cmsSiteId: string | null;
  cmsSlug: string | null;
  matchedBy: string | null;
  reason: string | null;
}

export interface CmsFacts {
  link: CmsLink;
  site: ClientSite | null;
  components: ClientComponent[];
  assets: ClientAsset[];
}

export interface Readiness {
  items: ChecklistItem[];
  families: FamilyCoverage[];
  met: number;
  total: number;
  planNodesLive: number;
}

function stateFor(required: number, actual: number): ItemState {
  if (actual >= required) return "met";
  return actual > 0 ? "partial" : "unmet";
}

export function normalizeDomain(domain: string | null | undefined): string {
  if (!domain) return "";
  let text = domain.trim().toLowerCase();
  for (const prefix of ["https://", "http://"]) {
    if (text.startsWith(prefix)) text = text.slice(prefix.length);
  }
  if (text.startsWith("www.")) text = text.slice(4);
  return text.replace(/\/+$/, "");
}

/**
 * `client_sites.navigation` is authored jsonb — a list, or an object wrapping
 * one. Anything else is reported as unknown rather than silently counted zero.
 */
export function navEntryCount(navigation: unknown): { count: number; detail: string } {
  if (Array.isArray(navigation)) return { count: navigation.length, detail: "navigation[]" };
  if (navigation && typeof navigation === "object") {
    const record = navigation as Record<string, unknown>;
    for (const key of ["items", "links", "main", "primary"]) {
      const value = record[key];
      if (Array.isArray(value)) return { count: value.length, detail: `navigation.${key}[]` };
    }
    if (Object.keys(record).length === 0) return { count: 0, detail: "navigation is empty" };
    return {
      count: -1,
      detail: `navigation is an object with keys ${Object.keys(record).slice(0, 6).sort().join(", ")} — no list found`,
    };
  }
  if (navigation === null || navigation === undefined) {
    return { count: 0, detail: "navigation is not set" };
  }
  return { count: -1, detail: `navigation is a ${typeof navigation}, not a list or object` };
}

function assetMatches(asset: ClientAsset, key: string): boolean {
  const needle = key.toLowerCase();
  if ((asset.tags ?? []).some((tag) => String(tag).trim().toLowerCase() === needle)) return true;
  const folder = (asset.folder ?? "").trim().toLowerCase();
  if (folder === needle || folder.endsWith(`/${needle}`)) return true;
  return (asset.file_name ?? "").toLowerCase().includes(needle);
}

/** Resolve a `web.site` to its CMS counterpart, in order of authority. */
export function resolveCmsLink(
  site: { domain: string | null; settings: unknown },
  cmsSites: ClientSite[],
): CmsLink {
  const none = (reason: string): CmsLink => ({
    linked: false,
    cmsSiteId: null,
    cmsSlug: null,
    matchedBy: null,
    reason,
  });

  const settings =
    site.settings && typeof site.settings === "object"
      ? (site.settings as Record<string, unknown>)
      : {};
  const override =
    settings.cms && typeof settings.cms === "object"
      ? (settings.cms as Record<string, unknown>)
      : {};

  if (typeof override.site_id === "string") {
    const row = cmsSites.find((entry) => entry.id === override.site_id);
    if (!row) return none(`settings.cms.site_id "${override.site_id}" is not a CMS site you can see.`);
    return { linked: true, cmsSiteId: row.id, cmsSlug: row.slug, matchedBy: "settings.cms.site_id", reason: null };
  }
  if (typeof override.slug === "string") {
    const row = cmsSites.find((entry) => entry.slug === override.slug);
    if (!row) return none(`settings.cms.slug "${override.slug}" is not a CMS site you can see.`);
    return { linked: true, cmsSiteId: row.id, cmsSlug: row.slug, matchedBy: "settings.cms.slug", reason: null };
  }

  const domain = normalizeDomain(site.domain);
  if (!domain) return none("This site has no domain to match a CMS site on.");
  const match = cmsSites.find((entry) => normalizeDomain(entry.domain) === domain);
  if (!match) return none(`No CMS site matches the domain ${domain}.`);
  return { linked: true, cmsSiteId: match.id, cmsSlug: match.slug, matchedBy: "domain", reason: null };
}

const COMPONENT_TYPE_FOR: Record<string, string> = { header: "header", footer: "footer" };

/**
 * Build the whole checklist. `cms` is optional — without it, every foundation
 * item that lives in the CMS reads `unknown` with the reason, never `unmet`
 * (claiming "you have no header" when we simply could not look is a lie).
 */
export function buildReadiness(args: {
  expanded: ExpandedArchetype;
  liveNodes: PlanNodeRow[];
  hasBrand: boolean;
  cms: CmsFacts | null;
  cmsError: string | null;
}): Readiness {
  const { expanded, liveNodes } = args;
  const liveRoutes = new Set(
    liveNodes.map((node) => node.route).filter((route): route is string => Boolean(route)),
  );

  const items: ChecklistItem[] = [];

  // ── gate: no brand, no plan rows (the DB rejects them, loudly) ───────────
  items.push({
    key: "brand",
    group: "gate",
    label: "Site has a brand",
    required: 1,
    actual: args.hasBrand ? 1 : 0,
    state: args.hasBrand ? "met" : "unmet",
    detail: args.hasBrand
      ? "web.site.brand_id is set"
      : "The database rejects every plan row for a brandless site — assign a brand in Marketing → Sites first.",
  });

  // ── pages: core + families, measured against live routes ────────────────
  const coreSpecs = expanded.roots.flatMap((root) => [
    root,
    ...root.children.filter((child) => child.role === "core"),
  ]);
  const coreLive = coreSpecs.filter((spec) => liveRoutes.has(spec.route)).length;
  items.push({
    key: "core",
    group: "pages",
    label: "Core pages",
    required: coreSpecs.length,
    actual: coreLive,
    state: stateFor(coreSpecs.length, coreLive),
    detail: coreSpecs
      .map((spec) => `${spec.route}${liveRoutes.has(spec.route) ? "" : " (missing)"}`)
      .join("  "),
  });

  const families: FamilyCoverage[] = expanded.families.map((family) => {
    const prefix = `${family.route}/`;
    const planned = liveNodes.filter(
      (node) => node.route && node.route.startsWith(prefix) && node.depth === 2,
    ).length;
    return {
      key: family.key,
      label: family.label,
      route: family.route,
      targetCount: family.count,
      plannedCount: planned,
    };
  });

  for (const family of families) {
    items.push({
      key: `family:${family.key}`,
      group: "pages",
      label: `${family.label} pages`,
      required: family.targetCount,
      actual: family.plannedCount,
      state: stateFor(family.targetCount, family.plannedCount),
      detail: `${family.route}/* — ${family.plannedCount} of ${family.targetCount} planned`,
    });
  }

  // ── foundation: tokens / header / footer / nav / assets (CMS side) ───────
  for (const requirement of expanded.foundation) {
    items.push(foundationItem(requirement, args.cms, args.cmsError));
  }

  const total = items.length;
  const met = items.filter((item) => item.state === "met").length;
  return { items, families, met, total, planNodesLive: liveNodes.length };
}

function foundationItem(
  requirement: FoundationRequirement,
  cms: CmsFacts | null,
  cmsError: string | null,
): ChecklistItem {
  const declared = `declared as ${requirement.declaredAs}`;
  const base = {
    key: requirement.key,
    group: "foundation" as const,
    label: requirement.label,
    required: requirement.required,
  };

  if (cmsError) {
    return { ...base, actual: 0, state: "unknown", detail: `Not checked — ${cmsError}` };
  }
  if (!cms || !cms.link.linked || !cms.site) {
    return {
      ...base,
      actual: 0,
      state: "unknown",
      detail: `Not checked — ${cms?.link.reason ?? "no CMS site linked"}. ${declared}.`,
    };
  }

  if (requirement.kind === "tokens") {
    const keys = Object.keys(cms.site.theme_config ?? {});
    return {
      ...base,
      actual: keys.length > 0 ? 1 : 0,
      state: keys.length > 0 ? "met" : "unmet",
      detail:
        keys.length > 0
          ? `theme_config has ${keys.length} key(s)`
          : "theme_config is empty on the linked CMS site",
    };
  }

  if (requirement.kind === "component") {
    const type = COMPONENT_TYPE_FOR[requirement.key] ?? requirement.key;
    const actual = cms.components.filter(
      (component) => component.component_type === type && component.is_active,
    ).length;
    return {
      ...base,
      actual,
      state: stateFor(requirement.required, actual),
      detail: `${actual} active component(s) of type "${type}"`,
    };
  }

  if (requirement.kind === "nav") {
    const { count, detail } = navEntryCount(cms.site.navigation);
    if (count < 0) return { ...base, actual: 0, state: "unknown", detail };
    return {
      ...base,
      actual: count,
      state: stateFor(requirement.required, count),
      detail: `${count} from ${detail} · ${declared}`,
    };
  }

  const assetKey = requirement.key.slice("asset:".length);
  const actual = cms.assets.filter(
    (asset) => asset.is_active && assetMatches(asset, assetKey),
  ).length;
  return {
    ...base,
    actual,
    state: stateFor(requirement.required, actual),
    detail: `${actual} asset(s) tagged/foldered/named "${assetKey}" · ${declared}`,
  };
}
