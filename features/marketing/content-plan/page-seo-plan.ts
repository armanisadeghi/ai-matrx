"use client";

/**
 * features/marketing/content-plan/page-seo-plan.ts
 *
 * Reading THE per-page SEO plan — from `web.page`, the one place it lives.
 *
 * Arman's ruling, 2026-08-16 (`common-docs/systems/content-planning/FEATURE.md`
 * invariant 9): a page's SEO intent is `web.page.meta_*_desired` plus the
 * `desired_values` slices (`keyword_plan`, `outbound_links`), for a plan-born
 * page, a CMS-native page and an externally-hosted crawled page alike.
 * `plan.node` keeps structure, routes, briefs and the pipeline — it does not
 * keep a second SEO plan.
 *
 * This is the client-side reader of that record, and the twin of aidream's
 * `services/content_plan/page_seo_plan.py`. Both join a plan node to its page
 * through the platform's ONE route comparer — `pageRouteKey` here,
 * `page_route_key` in Python — never a hand-rolled trailing-slash strip.
 *
 * Keywords are `seo.keyword` FKs, so a display needs their phrases; this
 * resolves them in ONE query for the whole site rather than per card.
 */
import { pageRouteKey } from "@/features/marketing/lib/page-url";
import type { PageKeywordPlan, PlannedLinkEntry } from "@/features/marketing/types";
import { isJsonRecord } from "@/features/marketing/types";
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";

/** A keyword the plan targets, resolved from its `seo.keyword` id. */
export interface PlanKeyword {
  id: string;
  phrase: string;
  intentClass: string | null;
}

/** One page's whole desired-state SEO record. */
export interface PageSeoPlan {
  webPageId: string;
  url: string;
  routeKey: string;
  primaryKeyword: PlanKeyword | null;
  secondaryKeywords: PlanKeyword[];
  pageRole: string;
  supportsRoutes: string[];
  reason: string;
  /** Planned internal links — `desired_values.outbound_links`. */
  outboundLinks: PlannedLinkEntry[];
  metaTitle: string;
  metaDescription: string;
}

/** True when this page has SEO intent recorded at all. */
export function hasSeoPlan(plan: PageSeoPlan | null | undefined): boolean {
  if (!plan) return false;
  return Boolean(
    plan.primaryKeyword ||
      plan.secondaryKeywords.length > 0 ||
      plan.pageRole ||
      plan.supportsRoutes.length > 0 ||
      plan.outboundLinks.length > 0 ||
      plan.reason,
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readKeywordPlan(desired: unknown): PageKeywordPlan {
  if (!isJsonRecord(desired)) return {};
  const raw = (desired as Record<string, unknown>).keyword_plan;
  return isJsonRecord(raw) ? (raw as PageKeywordPlan) : {};
}

function readOutboundLinks(desired: unknown): PlannedLinkEntry[] {
  if (!isJsonRecord(desired)) return [];
  const raw = (desired as Record<string, unknown>).outbound_links;
  if (!Array.isArray(raw)) return [];
  const links: PlannedLinkEntry[] = [];
  for (const item of raw) {
    if (!isJsonRecord(item)) continue;
    const url = text((item as Record<string, unknown>).url);
    if (!url) continue;
    links.push({
      id: text((item as Record<string, unknown>).id) || url,
      url,
      anchor_text: text((item as Record<string, unknown>).anchor_text),
    });
  }
  return links;
}

/**
 * Every page plan on a site, keyed by `pageRouteKey`.
 *
 * One read of `web.page` and one of `seo.keyword` for the whole site: a plan
 * surface asks about a page AND its siblings in the same render, so a
 * per-node query would be one round trip per row.
 */
export async function loadSitePageSeoPlans(
  webSiteId: string,
  signal?: AbortSignal,
): Promise<Map<string, PageSeoPlan>> {
  const db = await authenticatedWebDb(supabase);
  let query = db
    .from("page")
    .select(
      "id, url, canonical_page_id, desired_values, meta_title_desired, meta_description_desired",
    )
    .eq("site_id", webSiteId)
    .is("deleted_at", null);
  if (signal) query = query.abortSignal(signal);
  const response = await query;
  if (response.error) throw response.error;

  const rows = response.data ?? [];
  const keywordIds = new Set<string>();
  for (const row of rows) {
    const plan = readKeywordPlan(row.desired_values);
    const primary = text(plan.primary_keyword_id);
    if (primary) keywordIds.add(primary);
    for (const id of stringList(plan.secondary_keyword_ids)) keywordIds.add(id);
  }

  const keywords = new Map<string, PlanKeyword>();
  if (keywordIds.size > 0) {
    const keywordResponse = await supabase
      .schema("seo")
      .from("keyword")
      .select("id, phrase, intent_class")
      .in("id", [...keywordIds]);
    if (keywordResponse.error) throw keywordResponse.error;
    for (const row of keywordResponse.data ?? []) {
      keywords.set(row.id, {
        id: row.id,
        phrase: row.phrase,
        intentClass: row.intent_class,
      });
    }
  }

  const plans = new Map<string, PageSeoPlan>();
  for (const row of rows) {
    const plan = readKeywordPlan(row.desired_values);
    const routeKey = pageRouteKey(row.url);
    const entry: PageSeoPlan = {
      webPageId: row.id,
      url: row.url,
      routeKey,
      primaryKeyword: keywords.get(text(plan.primary_keyword_id)) ?? null,
      secondaryKeywords: stringList(plan.secondary_keyword_ids)
        .map((id) => keywords.get(id))
        .filter((kw): kw is PlanKeyword => Boolean(kw)),
      pageRole: text(plan.page_role),
      supportsRoutes: stringList(plan.supports_routes),
      reason: text(plan.reason),
      outboundLinks: readOutboundLinks(row.desired_values),
      metaTitle: text(row.meta_title_desired),
      metaDescription: text(row.meta_description_desired),
    };
    // A site can hold an alias row and its canonical row at the same route
    // key. The CANONICAL row is the page; an alias never overrides it.
    const existing = plans.get(routeKey);
    if (!existing || row.canonical_page_id === row.id) plans.set(routeKey, entry);
  }
  return plans;
}

/** This route's plan out of a loaded site index, or null. */
export function planForRoute(
  plans: Map<string, PageSeoPlan> | null | undefined,
  route: string | null | undefined,
): PageSeoPlan | null {
  if (!plans) return null;
  return plans.get(pageRouteKey(route || "/")) ?? null;
}
