/**
 * The write half of `suggest → writeback`: land a drafted fix, by code or by
 * agent, on the page it belongs to — as a DRAFT, always.
 *
 * THIS MODULE OPENS NO NEW WRITE PATH. Both steps are the seams that already
 * existed and are already proven:
 *
 *   1. `updatePageIntent` — the ONE canonical desired-metadata path
 *      (optimistically locked on `version`, recomputes `seo_metrics_desired`
 *      with the deterministic evaluator).
 *   2. `resolvePushTarget` + `executeCmsPush` — the ONE Plan → CMS bridge.
 *
 * THE TWO INVARIANTS THIS FILE MUST NEVER BREAK, restated because a fix path
 * is exactly where someone would be tempted to break them:
 *
 *   - **THE 301 LAW.** Nothing here moves a page's route. We only ever push
 *     onto a CMS page the route ALREADY resolves to (`kind: "existing"`).
 *     A route with no CMS page is reported honestly and skipped — we never
 *     create a page, never rename one into the route, and never pass a
 *     `create` target to `executeCmsPush`.
 *   - **NEVER AUTO-PUBLISH.** `executeCmsPush` writes `_draft` twins only.
 *     Publishing stays a separate, deliberate human act in the CMS. Nothing
 *     in this module calls `publishDraft`, and it never can — that function
 *     is not imported here.
 *
 * A fix is metadata: the push payload carries the title/description and an
 * EMPTY body, so drafting a title can never silently overwrite whatever a
 * person is writing in the CMS editor.
 */

import { CmsPageService, CmsSiteService } from "@/features/cms/services/cmsService";
import type { ClientPageSummary } from "@/features/cms/types";
import { resolveCmsLink } from "@/features/marketing/content-plan/setup/readiness";
import { updatePageIntent } from "@/features/marketing/data/service";
import type { FindingFixDraft } from "@/features/marketing/lib/finding-fix";
import { pageRouteKey } from "@/features/marketing/lib/page-url";
import {
  executeCmsPush,
  resolvePushTarget,
} from "@/features/marketing/lib/push-to-cms";
import type { MarketingPage, MarketingSite } from "@/features/marketing/types";

export type FixCmsOutcome =
  | {
      status: "drafted";
      cmsSiteId: string;
      cmsPageId: string;
      route: string;
      /** True when the CMS page already had a pending draft we replaced. */
      replacedPendingDraft: boolean;
      warnings: string[];
    }
  | { status: "skipped"; reason: string };

/** The resolved target plus the CMS row it names, for the write step. */
interface ResolvedFixTarget {
  outcome: FixCmsOutcome;
  cmsPage: ClientPageSummary | null;
}

export interface ApplyFindingFixResult {
  /** The page after the intent write — carries the fresh `version`. */
  page: MarketingPage;
  /** What changed, in the user's words, for the receipt. */
  applied: { metaTitle?: string; metaDescription?: string };
  cms: FixCmsOutcome;
}

/**
 * Read where this page's route lands on the linked CMS site WITHOUT writing
 * anything — the preview the confirm dialog shows before the user commits.
 */
export async function previewFixCmsTarget(
  site: MarketingSite,
  page: MarketingPage,
): Promise<FixCmsOutcome> {
  return (await resolveFixTarget(site, page)).outcome;
}

async function resolveFixTarget(
  site: MarketingSite,
  page: MarketingPage,
): Promise<ResolvedFixTarget> {
  const cmsSites = await CmsSiteService.listSites();
  const link = resolveCmsLink(site, cmsSites);
  if (!link.linked || !link.cmsSiteId) {
    return {
      cmsPage: null,
      outcome: {
        status: "skipped",
        reason:
          link.reason ??
          "This site is not linked to a CMS site, so there is nowhere to draft the change. The fix is still saved as the page's desired metadata.",
      },
    };
  }
  const pages = await CmsPageService.listPages(link.cmsSiteId);
  const target = resolvePushTarget(page, pages);
  if (target.kind !== "existing") {
    return {
      cmsPage: null,
      outcome: {
        status: "skipped",
        reason:
          target.kind === "blocked"
            ? target.reason
            : `No page at ${pageRouteKey(page.path)} exists on the linked CMS site, and a fix never creates one or moves a route. The fix is saved as the page's desired metadata.`,
      },
    };
  }
  return {
    cmsPage: target.page,
    outcome: {
      status: "drafted",
      cmsSiteId: link.cmsSiteId,
      cmsPageId: target.page.id,
      route: pageRouteKey(target.page.route),
      replacedPendingDraft: Boolean(target.page.has_draft),
      warnings: [],
    },
  };
}

/**
 * Apply one drafted fix: save it as the page's desired metadata, then — when
 * the route already has a CMS page — write it into that page's DRAFT.
 *
 * The intent write is the part that must not be lost, so a CMS failure is
 * reported, never allowed to undo it (`executeCmsPush` has no rollback and
 * the desired metadata is valuable on its own).
 */
export async function applyFindingFix(args: {
  site: MarketingSite;
  page: MarketingPage;
  draft: FindingFixDraft;
  /** Set false to save the intent only (the "not on the live site yet" case). */
  pushToCms?: boolean;
}): Promise<ApplyFindingFixResult> {
  const { site, page, draft, pushToCms = true } = args;
  if (draft.metaTitle === undefined && draft.metaDescription === undefined) {
    throw new Error("This fix contains no change to apply.");
  }

  // An intent save writes all three fields together, so anything this fix
  // does not touch must be PRESERVED (the ApplyMetaToPage contract).
  const saved = await updatePageIntent({
    siteId: page.site_id,
    pageId: page.id,
    expectedVersion: page.version,
    targetKeyword: page.target_keyword,
    desiredMetaTitle: draft.metaTitle ?? page.meta_title_desired,
    desiredMetaDescription:
      draft.metaDescription ?? page.meta_description_desired,
  });

  const applied = {
    ...(draft.metaTitle !== undefined ? { metaTitle: draft.metaTitle } : {}),
    ...(draft.metaDescription !== undefined
      ? { metaDescription: draft.metaDescription }
      : {}),
  };

  if (!pushToCms) {
    return {
      page: saved,
      applied,
      cms: {
        status: "skipped",
        reason: "Saved as the page's desired metadata only, as you asked.",
      },
    };
  }

  const { outcome, cmsPage } = await resolveFixTarget(site, saved);
  if (outcome.status === "skipped" || cmsPage === null) {
    return {
      page: saved,
      applied,
      cms:
        outcome.status === "skipped"
          ? outcome
          : {
              status: "skipped",
              reason:
                "The linked CMS page could not be resolved, so nothing was drafted there. The fix is saved as the page's desired metadata.",
            },
    };
  }

  const result = await executeCmsPush({
    cmsSiteId: outcome.cmsSiteId,
    // THE 301 LAW: only ever an already-resolved EXISTING page. `resolveFixTarget`
    // is the sole producer of this value and never yields a `create` target.
    // `matchedBy` is re-derived from the row itself so a fix applied to a page
    // that was resolved by route still stamps the durable link on its way
    // through — see `resolvePushTarget`.
    target: {
      kind: "existing",
      page: cmsPage,
      matchedBy: cmsPage.web_page_id === saved.id ? "link" : "route",
    },
    page: saved,
    // Metadata only — an empty body leaves the CMS draft's content untouched.
    payload: {
      contentMarkdown: "",
      metaTitle: draft.metaTitle ?? null,
      metaDescription: draft.metaDescription ?? null,
    },
  });

  return {
    page: saved,
    applied,
    cms: {
      ...outcome,
      route: pageRouteKey(result.page.route),
      warnings: result.warnings,
    },
  };
}
