"use client";

/**
 * features/marketing/content-plan/page-seo-plan.ts
 *
 * THE SITE-WIDE index of per-page SEO plans, keyed by route.
 *
 * `features/marketing/seo/plan/plan-model.ts` is the canonical normalizer for
 * ONE page's plan (`SeoPlanDraft`, `readSeoPlan`, `readPlannedOutboundLinks`)
 * and this module does not repeat a line of it. What it adds is the thing a
 * PLAN surface needs and a page surface does not: given a set of `plan.node`
 * rows, which page record holds each one's plan, and what are its keywords
 * called.
 *
 * The join is the platform's ONE route comparer — `pageRouteKey` here,
 * `page_route_key` in aidream's twin `services/content_plan/page_seo_plan.py`.
 * Never a hand-rolled trailing-slash strip.
 *
 * Invariant 9 (`common-docs/systems/marketing/content-planning/FEATURE.md`, Arman
 * 2026-08-16): the plan lives on `web.page` and only there. A plan node no
 * longer carries one, so a plan surface reads it from here.
 */
import { pageRouteKey } from "@/features/marketing/lib/page-url";
import {
  readPlannedOutboundLinks,
  readSeoPlan,
  type SeoPlanDraft,
} from "@/features/marketing/seo/plan/plan-model";
import type { MarketingPage, PlannedLinkEntry } from "@/features/marketing/types";
import { supabase } from "@/utils/supabase/client";
import { fetchUniversalFacets } from "@/features/marketing/seo/keyword/universal-facets";
import { authenticatedWebDb } from "@/utils/supabase/webDb";

/** A keyword the plan targets, resolved from its `seo.keyword` id. */
export interface PlanKeyword {
  id: string;
  phrase: string;
  intentClass: string | null;
}

/** One page's plan, with its keyword ids already resolved to phrases. */
export interface RoutePlan {
  webPageId: string;
  url: string;
  routeKey: string;
  draft: SeoPlanDraft;
  primaryKeyword: PlanKeyword | null;
  secondaryKeywords: PlanKeyword[];
  outboundLinks: PlannedLinkEntry[];
  metaTitle: string;
  metaDescription: string;
}

/** The site's plans, keyed by `pageRouteKey`. */
export type SitePlanIndex = Map<string, RoutePlan>;

/** True when this page has any SEO intent recorded. */
export function hasRoutePlan(plan: RoutePlan | null | undefined): boolean {
  if (!plan) return false;
  const { draft } = plan;
  return Boolean(
    draft.primaryKeywordId ||
      draft.secondaryKeywordIds.length > 0 ||
      draft.pageRole ||
      draft.supportsRoutes.length > 0 ||
      draft.reason ||
      plan.outboundLinks.length > 0,
  );
}

/** This route's plan out of a loaded index, or null. */
export function planForRoute(
  plans: SitePlanIndex | null | undefined,
  route: string | null | undefined,
): RoutePlan | null {
  if (!plans) return null;
  return plans.get(pageRouteKey(route || "/")) ?? null;
}

/** The columns `readSeoPlan` / `readPlannedOutboundLinks` actually read. */
const PLAN_PAGE_COLUMNS =
  "id, url, canonical_page_id, desired_values, meta_title_desired, meta_description_desired";

/**
 * Load every page plan on a site.
 *
 * TWO queries for the whole site, never one per node: a plan surface renders a
 * page AND its siblings' roles in the same pass, so per-row reads would be one
 * round trip per row.
 */
export async function loadSitePlanIndex(
  webSiteId: string,
  signal?: AbortSignal,
): Promise<SitePlanIndex> {
  const db = await authenticatedWebDb(supabase);
  let query = db
    .from("page")
    .select(PLAN_PAGE_COLUMNS)
    .eq("site_id", webSiteId)
    .is("deleted_at", null);
  if (signal) query = query.abortSignal(signal);
  const response = await query;
  if (response.error) throw response.error;
  const rows = (response.data ?? []) as unknown as MarketingPage[];

  const drafts = rows.map((row) => readSeoPlan(row));
  const keywordIds = new Set<string>();
  for (const draft of drafts) {
    if (draft.primaryKeywordId) keywordIds.add(draft.primaryKeywordId);
    for (const id of draft.secondaryKeywordIds) keywordIds.add(id);
  }

  const keywords = new Map<string, PlanKeyword>();
  if (keywordIds.size > 0) {
    const keywordResponse = await supabase
      .schema("seo")
      .from("keyword")
      .select("id, phrase")
      .in("id", [...keywordIds]);
    if (keywordResponse.error) throw keywordResponse.error;
    // Intent is a FACT, read from the fact store — never from `seo.keyword`'s
    // frozen legacy mirror column (see keyword/universal-facets.ts).
    const facets = await fetchUniversalFacets(supabase, [...keywordIds]);
    for (const row of keywordResponse.data ?? []) {
      keywords.set(row.id, {
        id: row.id,
        phrase: row.phrase,
        intentClass: facets.get(row.id)?.intent_class ?? null,
      });
    }
  }

  const index: SitePlanIndex = new Map();
  rows.forEach((row, position) => {
    const draft = drafts[position];
    const routeKey = pageRouteKey(row.url);
    const entry: RoutePlan = {
      webPageId: row.id,
      url: row.url,
      routeKey,
      draft,
      primaryKeyword: draft.primaryKeywordId
        ? (keywords.get(draft.primaryKeywordId) ?? null)
        : null,
      secondaryKeywords: draft.secondaryKeywordIds
        .map((id) => keywords.get(id))
        .filter((kw): kw is PlanKeyword => Boolean(kw)),
      outboundLinks: readPlannedOutboundLinks(row),
      metaTitle: (row.meta_title_desired ?? "").trim(),
      metaDescription: (row.meta_description_desired ?? "").trim(),
    };
    // A site can hold an alias row and its canonical row at the same route
    // key. The CANONICAL row is the page; an alias never overrides it.
    const existing = index.get(routeKey);
    if (!existing || row.canonical_page_id === row.id) index.set(routeKey, entry);
  });
  return index;
}
