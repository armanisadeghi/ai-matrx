/**
 * The readiness ledger — "what did we promise, and what actually exists?"
 *
 * A port of aidream's `services/content_plan/foundation.py` scoring rules, so
 * the browser and the agent report the same numbers. It is deliberately
 * PERSISTENT, not a day-zero wizard step: it measures the archetype recorded on
 * the site (`web.site.settings.content_plan`) against live plan + CMS state
 * every time the page is opened.
 *
 * Honesty rule: when there is no CMS site linked, CMS-backed items are
 * `unlinked` — never a fabricated zero dressed up as a failure.
 */
import type { PlanNodeRow } from "@/features/marketing/content-plan/types";
import type { MarketingSite } from "@/features/marketing/types";

import type { ExpandedArchetype, FoundationRequirement } from "./archetypes";
import type { CmsActuals, CmsReadiness } from "./data";

export type ItemState = "met" | "partial" | "unmet" | "unknown" | "unlinked";

export interface ReadinessItem extends FoundationRequirement {
  actual: number;
  state: ItemState;
  detail: string;
}

export interface FamilyCoverage {
  key: string;
  label: string;
  route: string;
  target: number;
  planned: number;
  hubExists: boolean;
  materialize: "pages" | "count_only";
}

export interface Blocker {
  id: string;
  title: string;
  detail: string;
  /** `true` = the database will refuse the write; commit must be disabled. */
  hard: boolean;
}

export interface Readiness {
  blockers: Blocker[];
  items: ReadinessItem[];
  families: FamilyCoverage[];
  met: number;
  total: number;
  corePagesPresent: number;
  corePagesTotal: number;
}

function stateFor(required: number, actual: number): ItemState {
  if (actual >= required) return "met";
  return actual > 0 ? "partial" : "unmet";
}

function assetMatches(
  asset: { fileName: string; folder: string; tags: string[] },
  key: string,
): boolean {
  const needle = key.toLowerCase();
  if (asset.tags.some((tag) => String(tag).trim().toLowerCase() === needle)) {
    return true;
  }
  const folder = asset.folder.trim().toLowerCase();
  if (folder === needle || folder.endsWith(`/${needle}`)) return true;
  return asset.fileName.toLowerCase().includes(needle);
}

function itemFor(
  requirement: FoundationRequirement,
  actuals: CmsActuals | null,
): ReadinessItem {
  if (!actuals) {
    return {
      ...requirement,
      actual: 0,
      state: "unlinked",
      detail: "No CMS site linked — this cannot be measured yet.",
    };
  }

  if (requirement.kind === "tokens") {
    const actual = actuals.themeKeys.length > 0 || actuals.hasGlobalCss ? 1 : 0;
    return {
      ...requirement,
      actual,
      state: stateFor(requirement.required, actual),
      detail:
        `theme_config keys: ${actuals.themeKeys.length ? actuals.themeKeys.join(", ") : "none"}; ` +
        `global_css: ${actuals.hasGlobalCss ? "set" : "empty"}`,
    };
  }

  if (requirement.kind === "component") {
    const wanted = requirement.key; // "header" | "footer"
    const matches = actuals.components.filter(
      (component) => component.componentType.trim().toLowerCase() === wanted,
    );
    return {
      ...requirement,
      actual: matches.length,
      state: stateFor(requirement.required, matches.length),
      detail: `active ${wanted} components: ${
        matches.map((c) => c.name || "(unnamed)").join(", ") || "none"
      }`,
    };
  }

  if (requirement.kind === "nav") {
    if (actuals.navCount < 0) {
      return {
        ...requirement,
        actual: 0,
        state: "unknown",
        detail: actuals.navDetail,
      };
    }
    return {
      ...requirement,
      actual: actuals.navCount,
      state: stateFor(requirement.required, actuals.navCount),
      detail: actuals.navDetail,
    };
  }

  const assetKey = requirement.key.slice(requirement.key.indexOf(":") + 1);
  const matches = actuals.assets.filter((asset) => assetMatches(asset, assetKey));
  return {
    ...requirement,
    actual: matches.length,
    state: stateFor(requirement.required, matches.length),
    detail: `matched ${matches.length} of ${actuals.assets.length} active assets on tag/folder/file_name "${assetKey}"`,
  };
}

/** How the `?site=` in the URL resolved against the caller's visible sites. */
export type SiteState = "none" | "loading" | "missing" | "ready";

export function computeReadiness(args: {
  site: MarketingSite | null;
  siteState: SiteState;
  expanded: ExpandedArchetype | null;
  nodes: PlanNodeRow[];
  cms: CmsReadiness | null;
}): Readiness {
  const { site, siteState, expanded, nodes, cms } = args;
  const blockers: Blocker[] = [];

  if (site && !site.brand_id) {
    blockers.push({
      id: "no-brand",
      title: "This site has no brand",
      detail:
        "plan._require_branded_site rejects every node write until web.site.brand_id is set. " +
        "Assign a brand on the site's settings page, then come back.",
      hard: true,
    });
  }
  if (siteState === "none") {
    blockers.push({
      id: "no-site",
      title: "Pick a site",
      detail: "Choose the site this plan belongs to from the header.",
      hard: true,
    });
  }
  if (siteState === "missing") {
    // A `?site=` the caller cannot see is a different failure from "none
    // picked" — telling them to pick a site they can already see in the URL
    // sends them in a circle.
    blockers.push({
      id: "site-not-visible",
      title: "That site is not available to you",
      detail:
        "The site in the URL is not in the list your account can administer — it " +
        "may belong to another organization, or it may have been deleted. Pick a " +
        "site from the header.",
      hard: true,
    });
  }
  if (site && !expanded) {
    blockers.push({
      id: "no-archetype",
      title: "Pick a shape",
      detail: "Choose an archetype on the left to see the pages it would create.",
      hard: true,
    });
  }

  const liveRoutes = new Set(
    nodes.map((node) => node.route).filter((route): route is string => Boolean(route)),
  );

  const families: FamilyCoverage[] = (expanded?.families ?? []).map((family) => {
    const prefix = `${family.route}/`;
    const planned = [...liveRoutes].filter(
      (route) => route.startsWith(prefix) && !route.slice(prefix.length).includes("/"),
    ).length;
    return {
      key: family.key,
      label: family.label,
      route: family.route,
      target: family.count,
      planned,
      hubExists: liveRoutes.has(family.route),
      materialize: family.materialize,
    };
  });

  const coreRows = (expanded?.flat ?? []).filter((node) => node.group === "core");
  const corePagesPresent = coreRows.filter((node) => liveRoutes.has(node.route)).length;

  const items = (expanded?.foundation ?? []).map((requirement) =>
    itemFor(requirement, cms?.actuals ?? null),
  );

  return {
    blockers,
    items,
    families,
    met: items.filter((item) => item.state === "met").length,
    total: items.length,
    corePagesPresent,
    corePagesTotal: coreRows.length,
  };
}
