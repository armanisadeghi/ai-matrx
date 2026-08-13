/**
 * features/marketing/lib/push-to-cms.ts
 *
 * Push a marketing page's authored plan (draft content + desired meta) into
 * the CMS as a DRAFT — the write half of the Plan → CMS bridge consumed by
 * `PushToCmsCard`.
 *
 * Contract (CMS owner agent, 2026-07-29):
 *  - ONE write path: `CmsPageService` riding the existing `/api/cms/*` seam
 *    with the human's auth. Never the aidream bridge endpoints, never a
 *    second client. Never auto-publish — content lands ONLY in `_draft`
 *    twins on an unpublished-or-published page; `publishDraft` stays a
 *    separate explicit act elsewhere.
 *  - Page mapping is by DURABLE ID: `client_pages.web_page_id` holds the
 *    `web.page` this CMS page serves (CMS migration 0037). Route matching is
 *    the FIRST-LINK path only — once a page is linked, the route may drift,
 *    change case, or move and the join still lands on the same row. This is
 *    growth-loop gap `G-CMS-IDENTITY`; see `resolvePushTarget`.
 *  - THE 301 LAW: this push NEVER moves a CMS page's route. Existing pages
 *    get `saveDraft` only (no slug/category/parent writes); missing pages
 *    are created at the route, never renamed into it.
 *  - Provenance `{source: "page-workspace", web_page_id, pushed_at}` rides
 *    into the CMS activity log (`changes.metadata`, the C6 seam) on every
 *    write — `client_pages` has no metadata jsonb column (verified live).
 */

import { CmsPageService } from "@/features/cms/services/cmsService";
import type { ClientPage, ClientPageSummary } from "@/features/cms/types";
import type { MarketingPage } from "@/features/marketing/types";
import {
  getPlanNode,
  updatePlanNode,
} from "@/features/marketing/content-plan/data/service";
import {
  pageRouteKey,
  pageRouteMatchKey,
} from "@/features/marketing/lib/page-url";
import { categoriesService } from "@/features/scopes/service/categoriesService";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";

export type PushTarget =
  | {
      kind: "existing";
      page: ClientPageSummary;
      /**
       * How this page was found. `link` = the durable `web_page_id`; `route`
       * = an exact route key (first link, or a page created before 0037);
       * `alias` = a case-insensitive route key that named exactly ONE
       * candidate — the looser matcher, never the identity.
       */
      matchedBy: "link" | "route" | "alias";
    }
  | {
      kind: "create";
      route: string;
      slug: string;
      category: string | null;
      parentId: string | null;
    }
  | { kind: "blocked"; reason: string };

/**
 * Decide where this marketing page lands on the CMS site. Pure — no I/O.
 *
 * RESOLUTION ORDER — the durable id first, strings only as a last resort:
 *
 *   1. `client_pages.web_page_id === page.id`. Once a page is linked this is
 *      the whole answer: the route can move, change case, gain a trailing
 *      slash or a query and the join still lands on the same row. THE fix for
 *      growth-loop gap `G-CMS-IDENTITY`.
 *   2. Exact `pageRouteKey` — the FIRST-LINK path (nothing is linked yet, or
 *      the page predates migration 0037). `executeCmsPush` stamps the durable
 *      link on the way through, so a route match happens at most once per page.
 *   3. Case-insensitive `pageRouteMatchKey`, and ONLY when it names exactly
 *      one candidate. This is the sanctioned use of the looser key: reconcile
 *      a route that failed the exact match. Two candidates is an ambiguity we
 *      refuse rather than guess at — guessing is what silently attached
 *      measurement to the wrong page.
 *
 * A page already linked to a DIFFERENT `web.page` is never silently reused:
 * the durable link, not the route, decides identity.
 *
 * Create derivation follows the trigger's own rules (`_client_page_route_of`):
 * a parent page at the prefix route wins (exact, any depth); a 2-segment path
 * without a parent uses `category`; deeper paths REQUIRE the parent to exist
 * (we never invent intermediate pages); `/` maps only onto an existing
 * homepage (`is_home_page`) — we refuse to mint a new homepage from a push.
 */
export function resolvePushTarget(
  page: MarketingPage,
  cmsPages: ClientPageSummary[],
): PushTarget {
  const route = pageRouteKey(page.path);

  // 1 — the durable link. Beats every string, including the homepage flag.
  const linked = cmsPages.find((row) => row.web_page_id === page.id);
  if (linked) return { kind: "existing", page: linked, matchedBy: "link" };

  /** Pages free to be claimed by a route match — never one linked elsewhere. */
  const unlinked = cmsPages.filter((row) => !row.web_page_id);

  if (route === "/") {
    const home = unlinked.find((row) => row.is_home_page);
    if (home) return { kind: "existing", page: home, matchedBy: "route" };
    return {
      kind: "blocked",
      reason: cmsPages.some((row) => row.is_home_page)
        ? "The CMS homepage is already linked to a different measured page. Unlink it in the CMS before pushing this one — a push never re-points an existing link."
        : "This is the homepage and the CMS site has no homepage yet. Create the homepage in the CMS first — a push must not decide the site's home.",
    };
  }

  // 2 — exact route key.
  const match = unlinked.find((row) => pageRouteKey(row.route) === route);
  if (match) return { kind: "existing", page: match, matchedBy: "route" };

  // 3 — the looser alias key, only when it is unambiguous.
  const aliasKey = pageRouteMatchKey(route);
  const aliases = unlinked.filter(
    (row) => pageRouteMatchKey(row.route) === aliasKey,
  );
  if (aliases.length === 1) {
    return { kind: "existing", page: aliases[0], matchedBy: "alias" };
  }
  if (aliases.length > 1) {
    return {
      kind: "blocked",
      reason: `${aliases.length} CMS pages differ from ${route} only by capitalisation (${aliases
        .map((row) => pageRouteKey(row.route))
        .join(", ")}). Link the right one in the CMS — a push never guesses between them.`,
    };
  }

  const segments = route.split("/").filter(Boolean);
  const slug = segments[segments.length - 1];
  if (segments.length === 1) {
    return { kind: "create", route, slug, category: null, parentId: null };
  }

  const parentRoute = `/${segments.slice(0, -1).join("/")}`;
  const parent = cmsPages.find((row) => pageRouteKey(row.route) === parentRoute);
  if (parent) {
    return { kind: "create", route, slug, category: null, parentId: parent.id };
  }
  if (segments.length === 2) {
    return { kind: "create", route, slug, category: segments[0], parentId: null };
  }
  return {
    kind: "blocked",
    reason: `No CMS page exists at ${parentRoute} to parent this ${segments.length}-level route. Create the parent page first — this push never invents intermediate pages.`,
  };
}

export interface PushPayload {
  /** Authored draft markdown from `web.page_content.content` (may be empty). */
  contentMarkdown: string;
  metaTitle: string | null;
  metaDescription: string | null;
}

export function buildPushPayload(
  page: MarketingPage,
  contentMarkdown: string | null,
): PushPayload {
  const trim = (value: string | null | undefined): string | null => {
    const text = (value ?? "").trim();
    return text.length > 0 ? text : null;
  };
  return {
    contentMarkdown: (contentMarkdown ?? "").trim(),
    metaTitle: trim(page.meta_title_desired),
    metaDescription: trim(page.meta_description_desired),
  };
}

export interface PushResult {
  created: boolean;
  page: ClientPage;
  /** Non-fatal honesty notes (e.g. the trigger derived a different route). */
  warnings: string[];
  /**
   * True when this push wrote the durable `web_page_id` link — i.e. the page
   * was resolved by route (or created) and is now joined by id forever after.
   */
  linked: boolean;
}

/**
 * Execute the push. Markdown → HTML happens here, client-side, via `marked`
 * (already in the dependency graph — `lib/email/exportService.ts` uses it);
 * imported lazily so the converter stays out of the route chunk.
 */
export async function executeCmsPush(args: {
  cmsSiteId: string;
  target: PushTarget;
  page: MarketingPage;
  payload: PushPayload;
}): Promise<PushResult> {
  const { cmsSiteId, target, page, payload } = args;
  if (target.kind === "blocked") {
    throw new Error(target.reason);
  }
  if (
    !payload.contentMarkdown &&
    payload.metaTitle === null &&
    payload.metaDescription === null
  ) {
    throw new Error(
      "Nothing to push — this page has no draft content and no desired meta title or description.",
    );
  }

  const warnings: string[] = [];
  let html: string | undefined;
  if (payload.contentMarkdown) {
    const { marked } = await import("marked");
    html = marked.parse(payload.contentMarkdown, { async: false });
  }

  const provenance = {
    source: "page-workspace",
    web_page_id: page.id,
    pushed_at: new Date().toISOString(),
  };

  let cmsPageId: string;
  let created = false;
  /** Already joined by id? Then there is nothing to stamp. */
  let needsLink = true;
  if (target.kind === "existing") {
    cmsPageId = target.page.id;
    needsLink = target.matchedBy !== "link";
  } else {
    const createdPage = await CmsPageService.createPage({
      siteId: cmsSiteId,
      slug: target.slug,
      title: payload.metaTitle ?? target.slug,
      category: target.category ?? undefined,
      parentId: target.parentId ?? undefined,
      isPublished: false,
      provenance,
    });
    cmsPageId = createdPage.id;
    created = true;
    const actualRoute = pageRouteKey(createdPage.route);
    if (actualRoute !== target.route) {
      warnings.push(
        `The CMS derived route ${actualRoute} instead of ${target.route} — review the page's slug/category in the CMS.`,
      );
    }
  }

  // Stamp the durable link BEFORE the content write, so a page that exists at
  // all is a page that can be found by id — a draft saved onto an unlinked
  // page is exactly the row a later route-normalisation disagreement loses.
  // A conflict here (another page already owns this measured page) is a real
  // ambiguity: fail loudly rather than write content into the wrong page.
  let linked = false;
  if (needsLink) {
    await CmsPageService.setWebPageLink(cmsPageId, page.id);
    linked = true;
  }

  const saved = await CmsPageService.saveDraft(cmsPageId, {
    ...(html !== undefined ? { htmlContent: html } : {}),
    ...(payload.metaTitle !== null ? { metaTitle: payload.metaTitle } : {}),
    ...(payload.metaDescription !== null
      ? { metaDescription: payload.metaDescription }
      : {}),
    provenance,
  });

  return { created, page: saved, warnings, linked };
}

// ─── Plan-node status bump (push v2) ────────────────────────────────────────

/** The `plan_status` category slug a successful push advances a node TO. */
export const PUSH_STATUS_BUMP_TARGET_SLUG = "in-production";

/**
 * Statuses a push may advance FROM (plus unset). Anything at or past
 * production (`in-review`, `approved`, `published`, `live-verified`,
 * `needs-update`, `retired`) is NEVER touched — a push must not walk a node
 * backwards through its lifecycle.
 */
const PUSH_BUMPABLE_STATUS_SLUGS = new Set(["idea", "planned", "briefed"]);

export interface PlanNodeStatusBump {
  bumped: boolean;
  fromSlug: string | null;
  toSlug?: string;
  /** Why nothing changed, when `bumped` is false. */
  reason?: string;
}

/**
 * After a successful CMS push, advance the linked `plan.node`'s status to
 * "in-production" — the plan board should reflect that the content left
 * planning. Only forward moves happen (see PUSH_BUMPABLE_STATUS_SLUGS);
 * failures throw so the caller can surface them loudly (the push itself has
 * already succeeded and is never rolled back for a bump failure).
 */
export async function bumpPlanNodeStatusAfterPush(
  planNodeId: string,
): Promise<PlanNodeStatusBump> {
  const node = await getPlanNode(planNodeId);
  const statuses = await categoriesService.list(CATEGORY_DIMENSIONS.planStatus);
  if (!statuses.ok) {
    throw new Error(
      `Could not load plan statuses: ${statuses.error.message}`,
    );
  }
  const categories = statuses.data.categories;
  const slugById = new Map(
    categories
      .filter((category) => category.slug)
      .map((category) => [category.id, category.slug as string]),
  );
  const fromSlug = node.status_id
    ? (slugById.get(node.status_id) ?? null)
    : null;
  if (fromSlug === PUSH_STATUS_BUMP_TARGET_SLUG) {
    return { bumped: false, fromSlug, reason: "already in production" };
  }
  if (fromSlug && !PUSH_BUMPABLE_STATUS_SLUGS.has(fromSlug)) {
    return {
      bumped: false,
      fromSlug,
      reason: `status "${fromSlug}" is at or past production — left untouched`,
    };
  }
  const target = categories.find(
    (category) => category.slug === PUSH_STATUS_BUMP_TARGET_SLUG,
  );
  if (!target) {
    throw new Error(
      `No "${PUSH_STATUS_BUMP_TARGET_SLUG}" status exists in the plan_status categories`,
    );
  }
  await updatePlanNode(planNodeId, { status_id: target.id });
  return { bumped: true, fromSlug, toSlug: PUSH_STATUS_BUMP_TARGET_SLUG };
}
