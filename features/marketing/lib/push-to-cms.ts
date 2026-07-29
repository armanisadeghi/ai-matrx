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
 *  - Page mapping is by ROUTE: `web.page.path` vs `client_pages.route`
 *    (full path, arbitrary depth, unique per `(client_id, route)`).
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

/** Leading slash, no trailing slash; `/` stays `/`. Mirrors readiness.ts. */
export function normalizeRoutePath(path: string | null | undefined): string {
  let text = (path ?? "").trim();
  if (!text) return "/";
  if (!text.startsWith("/")) text = `/${text}`;
  while (text.length > 1 && text.endsWith("/")) text = text.slice(0, -1);
  return text;
}

export type PushTarget =
  | { kind: "existing"; page: ClientPageSummary }
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
  const route = normalizeRoutePath(page.path);

  if (route === "/") {
    const home = cmsPages.find((row) => row.is_home_page);
    if (home) return { kind: "existing", page: home };
    return {
      kind: "blocked",
      reason:
        "This is the homepage and the CMS site has no homepage yet. Create the homepage in the CMS first — a push must not decide the site's home.",
    };
  }

  const match = cmsPages.find((row) => normalizeRoutePath(row.route) === route);
  if (match) return { kind: "existing", page: match };

  const segments = route.split("/").filter(Boolean);
  const slug = segments[segments.length - 1];
  if (segments.length === 1) {
    return { kind: "create", route, slug, category: null, parentId: null };
  }

  const parentRoute = `/${segments.slice(0, -1).join("/")}`;
  const parent = cmsPages.find(
    (row) => normalizeRoutePath(row.route) === parentRoute,
  );
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
  if (target.kind === "existing") {
    cmsPageId = target.page.id;
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
    const actualRoute = normalizeRoutePath(createdPage.route);
    if (actualRoute !== target.route) {
      warnings.push(
        `The CMS derived route ${actualRoute} instead of ${target.route} — review the page's slug/category in the CMS.`,
      );
    }
  }

  const saved = await CmsPageService.saveDraft(cmsPageId, {
    ...(html !== undefined ? { htmlContent: html } : {}),
    ...(payload.metaTitle !== null ? { metaTitle: payload.metaTitle } : {}),
    ...(payload.metaDescription !== null
      ? { metaDescription: payload.metaDescription }
      : {}),
    provenance,
  });

  return { created, page: saved, warnings };
}
