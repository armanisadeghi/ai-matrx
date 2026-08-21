"use client";

/**
 * features/marketing/content-plan/setup/keyword-strategy.ts
 *
 * Applying a WHOLE-PLAN keyword strategy — into THE one SEO-plan store.
 *
 * The strategy is deliberately top-down (see the Content Plan Keyword
 * Strategist agent): money pages own distinct commercial primaries, and
 * educational pages exist to rank on easier terms and pass authority to a
 * money page through planned internal links. That relationship is the point —
 * so the applied record keeps it, not just the primary keyword string.
 *
 * 🚨 WHERE IT LANDS — Arman's ruling, 2026-08-16
 * (`common-docs/systems/marketing/content-planning/FEATURE.md` invariant 9): **one SEO
 * plan per page, and it lives on `web.page`.** Everything below writes there
 * and nowhere else:
 *
 *  - `web.page.desired_values.keyword_plan` — `PageKeywordPlan`
 *    (`features/marketing/types.ts`): the primary and secondary keywords as
 *    `seo.keyword` FKs (resolved through the CANONICAL `ensureKeywordId`
 *    upsert; normalized-phrase dedupe lives server-side), the page role, the
 *    money routes a supporting page feeds, and the strategist's reasoning.
 *  - `web.page.desired_values.outbound_links` — the planned internal links, as
 *    `PlannedLinkEntry` rows. This is the platform's ONE link-prescription
 *    system, already scored by link compliance; the strategist used to keep a
 *    second, private copy that nothing else could read.
 *
 * Both go through `updatePageDesiredValues`, the single read-merge-write path,
 * so this card's slice can never clobber another card's.
 *
 * What is NO LONGER written: `plan.node.primary_keyword_id`,
 * `plan.node.attributes.keyword_strategy`, `web.page.target_keyword` (raw
 * text). A page's keyword intent has one home; two homes is exactly the defect
 * the ruling removed.
 */
import { ensurePlannedPages } from "@/features/marketing/content-plan/setup/bridge";
import {
  getPagesDesiredValues,
  updatePageDesiredValues,
} from "@/features/marketing/data/service";
import { ensureKeywordId } from "@/features/marketing/seo/keyword/data";
import type { PageKeywordPlan, PlannedLinkEntry } from "@/features/marketing/types";
import type { AppDispatch } from "@/lib/redux/store";
import { extractErrorMessage } from "@/utils/errors";

import { listPlanNodes } from "../data/service";
import type { PlanNodeRow } from "../types";
import type { KeywordAssignment } from "./ai";

/**
 * Marks a `PlannedLinkEntry` as authored by the whole-plan strategist, so a
 * re-run replaces its own links and leaves everyone else's alone.
 */
export const STRATEGY_LINK_PREFIX = "strategy:";

export interface KeywordApplyResult {
  /** Pages whose primary keyword was bound. */
  bound: number;
  /** Secondary keywords recorded across all pages. */
  secondaryKeywords: number;
  /** Planned internal links written as `outbound_links`. */
  plannedLinks: number;
  /** Keyword phrases newly created in the library. */
  createdKeywords: number;
  /** Assignment routes with no matching plan node. */
  unknownRoutes: string[];
  failures: string[];
}

/**
 * Turn a plan route into the absolute URL a `PlannedLinkEntry` carries.
 *
 * The link plan is keyed by URL because it also describes links to pages the
 * content plan does not own. The anchor page's own URL is the server's answer
 * (it derives every planned URL from the site's address), so this reuses the
 * site base the ensure call already resolved rather than re-deriving one.
 */
function linkUrlForRoute(
  route: string,
  urlByRoute: Map<string, string>,
): string | null {
  const known = urlByRoute.get(route);
  if (known) return known;
  // A route the plan does not contain gets no URL we can honestly build — the
  // caller reports it instead of inventing an address on a guessed origin.
  return null;
}

/**
 * Apply the strategist's assignments to the live plan.
 *
 * Per-node isolation: one page's failure never aborts the rest — the report
 * names every one. Routes the agent invented (not in the plan) are reported,
 * never created here: adding pages is the reviewer's explicit job, not a
 * silent side effect of assigning keywords.
 */
export async function applyKeywordStrategy(args: {
  dispatch: AppDispatch;
  siteId: string;
  assignments: KeywordAssignment[];
  /** Record secondary keywords in the plan too (default true). */
  includeSecondary?: boolean;
}): Promise<KeywordApplyResult> {
  const includeSecondary = args.includeSecondary ?? true;
  const liveNodes = await listPlanNodes(args.siteId);
  const byRoute = new Map<string, PlanNodeRow>();
  for (const node of liveNodes) {
    if (node.route) byRoute.set(node.route, node);
  }

  const result: KeywordApplyResult = {
    bound: 0,
    secondaryKeywords: 0,
    plannedLinks: 0,
    createdKeywords: 0,
    unknownRoutes: [],
    failures: [],
  };

  const known = args.assignments.filter((assignment) => {
    if (byRoute.has(assignment.route)) return true;
    result.unknownRoutes.push(assignment.route);
    return false;
  });
  if (known.length === 0) return result;

  // Every page a strategy touches needs its `web.page` record before the plan
  // can be written to it — including the money routes a supporting page links
  // to, so the link plan can name real URLs. Ensuring is idempotent, so asking
  // for the whole plan's routes at once costs one call.
  const wantedRoutes = new Set<string>();
  for (const assignment of known) {
    wantedRoutes.add(assignment.route);
    for (const link of assignment.internalLinks) {
      if (byRoute.has(link.toRoute)) wantedRoutes.add(link.toRoute);
    }
  }
  const anchors = await ensurePlannedPages(
    args.dispatch,
    args.siteId,
    [...wantedRoutes],
  );
  result.failures.push(...anchors.problems);
  const pageIdByRoute = new Map(anchors.pages.map((p) => [p.route, p.webPageId]));
  const urlByRoute = new Map(anchors.pages.map((p) => [p.route, p.url]));
  // The link plan is SHARED: a human (or another surface) can add outbound
  // links to the same page. Replacing the array wholesale would delete their
  // work, so every strategy write merges over what is already there.
  const currentDesired = await getPagesDesiredValues(
    args.siteId,
    anchors.pages.map((p) => p.webPageId),
  );

  // One phrase can appear on several pages (a secondary here, a primary
  // there) — resolve each exactly once.
  const idByPhrase = new Map<string, string>();
  const resolvePhrase = async (phrase: string): Promise<string> => {
    const key = phrase.trim().toLowerCase();
    const cached = idByPhrase.get(key);
    if (cached) return cached;
    const id = await ensureKeywordId(phrase);
    idByPhrase.set(key, id);
    return id;
  };

  for (const assignment of known) {
    const pageId = pageIdByRoute.get(assignment.route);
    if (!pageId) {
      // The ensure call already explained why in `problems`; saying it again
      // per route is what tells the user WHICH pages lost their assignment.
      result.failures.push(
        `${assignment.route}: no page record exists to hold this page's SEO plan, ` +
          "so its keyword assignment was not applied.",
      );
      continue;
    }
    try {
      let primaryKeywordId: string | null = null;
      if (assignment.primaryKeyword) {
        const before = idByPhrase.size;
        primaryKeywordId = await resolvePhrase(assignment.primaryKeyword);
        if (idByPhrase.size > before && assignment.primaryIsNew) {
          result.createdKeywords += 1;
        }
      }

      const secondaryIds: string[] = [];
      if (includeSecondary) {
        for (const phrase of assignment.secondaryKeywords) {
          try {
            secondaryIds.push(await resolvePhrase(phrase));
          } catch (error) {
            result.failures.push(
              `${assignment.route} secondary "${phrase}": ${extractErrorMessage(error)}`,
            );
          }
        }
      }

      const strategyLinks: PlannedLinkEntry[] = [];
      for (const link of assignment.internalLinks) {
        const url = linkUrlForRoute(link.toRoute, urlByRoute);
        if (!url) {
          result.failures.push(
            `${assignment.route}: the planned link to ${link.toRoute} was dropped — ` +
              "that route is not in the plan, so there is no page to link to.",
          );
          continue;
        }
        strategyLinks.push({
          // Stable per (source route → target route), so re-applying a
          // strategy updates the same entry instead of stacking duplicates.
          id: `${STRATEGY_LINK_PREFIX}${assignment.route}=>${link.toRoute}`,
          url,
          anchor_text: link.anchorText,
        });
      }

      // Keep every link this strategist did not author, drop the ones it did
      // (a re-run must not stack yesterday's plan on top of today's), then add
      // the current plan.
      const existing = currentDesired.get(pageId)?.outbound_links ?? [];
      const outboundLinks: PlannedLinkEntry[] = [
        ...existing.filter((entry) => !entry.id?.startsWith(STRATEGY_LINK_PREFIX)),
        ...strategyLinks,
      ];

      const keywordPlan: PageKeywordPlan = {
        primary_keyword_id: primaryKeywordId,
        secondary_keyword_ids: secondaryIds,
        page_role: assignment.pageRole,
        supports_routes: assignment.supportsRoutes,
        reason: assignment.reason,
      };

      await updatePageDesiredValues({
        siteId: args.siteId,
        pageId,
        patch: { keyword_plan: keywordPlan, outbound_links: outboundLinks },
        desiredMetaTitle: assignment.desiredMetaTitle,
        desiredMetaDescription: assignment.desiredMetaDescription,
      });

      if (primaryKeywordId) result.bound += 1;
      result.secondaryKeywords += secondaryIds.length;
      result.plannedLinks += strategyLinks.length;
    } catch (error) {
      result.failures.push(
        `${assignment.route}: ${extractErrorMessage(error)}`,
      );
    }
  }
  return result;
}
