/**
 * THE ONE per-page SEO plan model.
 *
 * Invariant 9 of the content-planning system of record
 * (`common-docs/systems/content-planning/FEATURE.md`): **one SEO plan per page,
 * and it lives on `web.page`** — the `keyword_plan` slice of `desired_values`
 * plus the `meta_*_desired` columns. This module is the normalized read/write
 * boundary over that slice; every surface that edits an SEO plan goes through
 * `SeoPlanEditor`, which goes through here.
 *
 * The jsonb is agent-written, so every read normalizes defensively — one
 * malformed record can never take down a panel.
 */
import {
  readPageDesiredValues,
  type MarketingPage,
  type PageKeywordPlan,
  type PlannedLinkEntry,
} from "@/features/marketing/types";

/**
 * The page roles the Keyword Strategist assigns. ONE list — the strategist's
 * response parser (`content-plan/setup/ai.ts`) and the SEO plan editor both
 * consume it, so a role can never be valid in one half and rejected in the
 * other.
 */
export const PAGE_ROLES = ["money", "supporting", "navigational"] as const;
export type PageRole = (typeof PAGE_ROLES)[number];

/** Human labels for the roles — the editor's picker renders these. */
export const PAGE_ROLE_LABELS: Record<PageRole, string> = {
  money: "Money page — the page that should convert",
  supporting: "Supporting page — feeds authority to a money page",
  navigational: "Navigational page — brand/utility, not a ranking target",
};

/** The editor's working shape: every field present, never undefined. */
export interface SeoPlanDraft {
  primaryKeywordId: string | null;
  secondaryKeywordIds: string[];
  pageRole: string;
  supportsRoutes: string[];
  reason: string;
}

export const EMPTY_SEO_PLAN: SeoPlanDraft = {
  primaryKeywordId: null,
  secondaryKeywordIds: [],
  pageRole: "",
  supportsRoutes: [],
  reason: "",
};

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
}

/** Normalize the stored slice into the editor's working shape. */
export function seoPlanFromSlice(
  slice: PageKeywordPlan | undefined,
): SeoPlanDraft {
  if (!slice || typeof slice !== "object") return EMPTY_SEO_PLAN;
  const primary = slice.primary_keyword_id;
  return {
    primaryKeywordId: typeof primary === "string" && primary ? primary : null,
    secondaryKeywordIds: Array.from(
      new Set(strings(slice.secondary_keyword_ids)),
    ),
    pageRole: typeof slice.page_role === "string" ? slice.page_role : "",
    supportsRoutes: Array.from(new Set(strings(slice.supports_routes))),
    reason: typeof slice.reason === "string" ? slice.reason : "",
  };
}

/** THE read: a page's SEO plan, from the one store. */
export function readSeoPlan(page: MarketingPage): SeoPlanDraft {
  return seoPlanFromSlice(readPageDesiredValues(page).keyword_plan);
}

export function isSeoPlanEmpty(draft: SeoPlanDraft): boolean {
  return (
    !draft.primaryKeywordId &&
    draft.secondaryKeywordIds.length === 0 &&
    !draft.pageRole.trim() &&
    draft.supportsRoutes.length === 0 &&
    !draft.reason.trim()
  );
}

/**
 * THE write shape. Empty fields are DROPPED rather than stored as empty
 * strings/arrays, so "no plan" reads identically whether the page was never
 * planned or the user cleared it. A wholly empty plan returns `undefined` —
 * the slice is removed, not written as `{}`.
 */
export function seoPlanToSlice(
  draft: SeoPlanDraft,
): PageKeywordPlan | undefined {
  if (isSeoPlanEmpty(draft)) return undefined;
  const slice: PageKeywordPlan = {};
  if (draft.primaryKeywordId) slice.primary_keyword_id = draft.primaryKeywordId;
  if (draft.secondaryKeywordIds.length > 0) {
    slice.secondary_keyword_ids = draft.secondaryKeywordIds;
  }
  if (draft.pageRole.trim()) slice.page_role = draft.pageRole.trim();
  if (draft.supportsRoutes.length > 0) {
    slice.supports_routes = draft.supportsRoutes;
  }
  if (draft.reason.trim()) slice.reason = draft.reason.trim();
  return slice;
}

/**
 * The strategist's planned internal links do NOT live in the keyword_plan
 * slice — they are the existing `outbound_links` link plan (one link-plan
 * system, already scored by link compliance). The SEO plan editor SHOWS them
 * and hands the user the door to the Link plan card that owns them.
 */
export function readPlannedOutboundLinks(
  page: MarketingPage,
): PlannedLinkEntry[] {
  const raw = readPageDesiredValues(page).outbound_links;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is PlannedLinkEntry =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as PlannedLinkEntry).url === "string",
  );
}
