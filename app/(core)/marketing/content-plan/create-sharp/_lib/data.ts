"use client";

/**
 * app/(core)/marketing/content-plan/create-sharp/_lib/data.ts
 *
 * Live reads/writes for the Site Shape surface. Everything is direct-to-
 * Supabase under RLS (CLAUDE.md data-flow rule) and every plan.node write
 * goes through the CANONICAL plan service (`features/marketing/content-plan/
 * data/service.ts`) — this module adds no second write path.
 *
 * ⚠ BAKE-OFF ISOLATION: `listArchetypeProfiles` is the ONE read that isn't
 * already in the canonical service (it needs `plan.profile` rows the caller
 * can see across orgs — the builtin library lives on the globally-readable
 * system org, so an org-filtered read can never find it). It lives here only
 * so this variant does not edit a file the sibling variants also touch. When
 * this variant is picked, MOVE it into `content-plan/data/service.ts` beside
 * `listPlanProfiles` and delete this note — the "nothing else touches
 * supabase.schema('plan')" rule is the real doctrine.
 */
import { useQuery } from "@tanstack/react-query";

import { CmsAssetService, CmsComponentService, CmsSiteService } from "@/features/cms/services/cmsService";
import type { PlanProfileRow } from "@/features/marketing/content-plan/types";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";

import {
  ARCHETYPE_MAP_KEY,
  BUILTIN_ARCHETYPE_VERTICAL,
  parseArchetypeMap,
  type Archetype,
} from "./archetypes";

export const shapeKeys = {
  all: ["content-plan-shape"] as const,
  archetypes: () => ["content-plan-shape", "archetypes"] as const,
  cmsFoundation: (domain: string) =>
    ["content-plan-shape", "cms-foundation", domain] as const,
};

// ─── the archetype library ───────────────────────────────────────────────

async function listArchetypeProfiles(
  signal?: AbortSignal,
): Promise<PlanProfileRow[]> {
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("plan")
    .from("profile")
    .select("*")
    .is("deleted_at", null)
    .order("vertical", { ascending: true })
    .limit(200)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  return response.data ?? [];
}

export interface ArchetypeLibrary {
  archetypes: Archetype[];
  /** Keys an org profile overrode, so the UI can say so instead of hiding it. */
  overriddenKeys: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Builtin (system-org, globally readable) + org-declared archetypes, merged
 * with the org key SHADOWING the builtin one — same precedence as aidream's
 * `load_archetypes`. A malformed archetype raises: half-parsing it would drop
 * exactly the counts that are the point.
 */
export function useArchetypeLibrary() {
  return useQuery<ArchetypeLibrary>({
    queryKey: shapeKeys.archetypes(),
    queryFn: async ({ signal }) => {
      const profiles = await listArchetypeProfiles(signal);
      const builtin: Record<string, Archetype> = {};
      const org: Record<string, Archetype> = {};
      for (const profile of profiles) {
        const templateMap = profile.template_map;
        if (!isRecord(templateMap)) continue;
        const raw = templateMap[ARCHETYPE_MAP_KEY];
        if (raw === undefined || raw === null) continue;
        const parsed = parseArchetypeMap(
          raw,
          `plan.profile[${profile.vertical}].template_map.archetypes`,
        );
        const target =
          profile.vertical === BUILTIN_ARCHETYPE_VERTICAL ? builtin : org;
        Object.assign(target, parsed);
      }
      const merged = { ...builtin, ...org };
      const overriddenKeys = Object.keys(org).filter((key) => key in builtin);
      // Smallest first — the list reads as a ladder ("how big is this site?"),
      // which is the actual question, and the default landing shape is the
      // modest one rather than whatever sorts first alphabetically.
      const sizeOf = (estimate: string) => {
        const match = /\d+/.exec(estimate);
        return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
      };
      return {
        archetypes: Object.values(merged).sort(
          (a, b) =>
            sizeOf(a.pageEstimate) - sizeOf(b.pageEstimate) ||
            a.label.localeCompare(b.label),
        ),
        overriddenKeys,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── CMS foundation actuals (the "is it actually built?" half) ───────────

export type FoundationState = "met" | "partial" | "unmet" | "unknown";

export interface CmsFoundationActuals {
  linked: boolean;
  /** Why not, when unlinked — never an error, a site with nothing built reads
   * as "nothing built". */
  reason: string | null;
  cmsSiteName: string | null;
  tokens: number;
  header: number;
  footer: number;
  /** -1 = the navigation blob is a shape we refuse to guess at. */
  navEntries: number;
  navDetail: string;
  /** One entry per CMS asset — matching is PER ASSET (a single logo tagged
   * "hero" must not make every asset count as a hero). */
  assets: { tags: string[]; folder: string; fileName: string }[];
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

function navEntryCount(navigation: unknown): [number, string] {
  if (Array.isArray(navigation)) return [navigation.length, "navigation[]"];
  if (isRecord(navigation)) {
    for (const key of ["items", "links", "main", "primary"]) {
      const value = navigation[key];
      if (Array.isArray(value)) return [value.length, `navigation.${key}[]`];
    }
    if (Object.keys(navigation).length === 0) return [0, "navigation is empty"];
    return [-1, "navigation is an object with no recognisable list"];
  }
  if (navigation === null || navigation === undefined) {
    return [0, "navigation is not set"];
  }
  return [-1, `navigation is a ${typeof navigation}, not a list`];
}

/**
 * Match the plan's `web.site` to its CMS counterpart by normalised domain and
 * read what actually exists. Unlinked is a FIRST-CLASS answer, not a failure:
 * every requirement then reads "nothing built" with the reason attached.
 */
export function useCmsFoundation(siteDomain: string | null) {
  const domain = normalizeDomain(siteDomain);
  return useQuery<CmsFoundationActuals>({
    queryKey: shapeKeys.cmsFoundation(domain || "none"),
    enabled: Boolean(domain),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const empty = (reason: string): CmsFoundationActuals => ({
        linked: false,
        reason,
        cmsSiteName: null,
        tokens: 0,
        header: 0,
        footer: 0,
        navEntries: 0,
        navDetail: "",
        assets: [],
      });

      const sites = await CmsSiteService.listSites();
      const match = sites.find(
        (site) => normalizeDomain(site.domain) === domain,
      );
      if (!match) {
        return empty(
          `No CMS site matches ${domain} — the foundation lives outside the plan.`,
        );
      }

      const [components, assets] = await Promise.all([
        CmsComponentService.listComponents(match.id),
        CmsAssetService.listAssets(match.id),
      ]);
      const active = components.filter((component) => component.is_active);
      const [navCount, navDetail] = navEntryCount(match.navigation);
      const themeKeys = isRecord(match.theme_config)
        ? Object.keys(match.theme_config).length
        : 0;

      return {
        linked: true,
        reason: null,
        cmsSiteName: match.name,
        tokens: themeKeys > 0 ? 1 : 0,
        header: active.filter((c) => c.component_type === "header").length,
        footer: active.filter((c) => c.component_type === "footer").length,
        navEntries: navCount,
        navDetail,
        assets: assets
          .filter((asset) => asset.is_active)
          .map((asset) => ({
            tags: (asset.tags ?? []).map((tag) =>
              String(tag).trim().toLowerCase(),
            ),
            folder: (asset.folder ?? "").trim().toLowerCase(),
            fileName: (asset.file_name ?? "").toLowerCase(),
          })),
      };
    },
  });
}

/** How many CMS assets satisfy one `asset:<key>` requirement. */
export function countAssetsFor(
  actuals: CmsFoundationActuals,
  assetKey: string,
): number {
  const needle = assetKey.trim().toLowerCase();
  return actuals.assets.filter(
    (asset) =>
      asset.tags.includes(needle) ||
      asset.folder === needle ||
      asset.folder.endsWith(`/${needle}`) ||
      asset.fileName.includes(needle),
  ).length;
}
