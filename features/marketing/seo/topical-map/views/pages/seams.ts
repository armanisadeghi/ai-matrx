// features/marketing/seo/topical-map/views/pages/seams.ts
//
// LANE F — the seams between the three pieces of the pages workspace, frozen
// by the lane owner before the builders started so each piece could be built
// in parallel against the same props and composed in `../PagesWorkspace.tsx`
// without a merge step. Types only; no runtime.
//
// The workspace (PagesWorkspace.tsx) owns the reads and the store; the three
// pieces below take what they need and never re-read it:
//   * `PagesBulkActions`   — `./bulk/PagesBulkActions.tsx`   (bulk two-click flows)
//   * `IntentReviewDeck`   — `./review/IntentReviewDeck.tsx` (ReviewDeck in intent_review_mode)
//   * `MapRunControls`     — `./runs/MapRunControls.tsx`     (the three header run controls)

import type { TopicalMapKnobs } from "../../knobs";
import type { PageIntentItem, SetPageIntentsResult } from "../../types";

/** What every piece of this screen is standing in. */
export interface PagesWorkspaceContext {
  mapId: string;
  /** `?site=` or the host's choice. null = every site the caller may view. */
  siteId: string | null;
  /** Write controls are ABSENT (not disabled) when true. */
  readOnly: boolean;
  /** The 53 knobs, loaded. A piece is never rendered before they are. */
  knobs: TopicalMapKnobs;
  /** The organization the workspace is in (for facet/site reads). Null while unknown. */
  organizationId: string | null;
  /**
   * The sites using this map, from `seo.map_diagnostics.sites_using_map`.
   * Empty until diagnostics load. A run control needs ONE site; when `siteId`
   * is null it chooses from these.
   */
  siteIds: readonly string[];
}

/**
 * `seo.set_page_intents` as migration 23 (aidream `0805`) actually returns it:
 * the frozen `SetPageIntentsResult` in `../../types.ts` predates `kept` and
 * the `kept_existing` row, so this lane narrows the raw result locally (see
 * `./bulk/setPageIntentsOutcome.ts`) and has filed the type change with the
 * coordinator. A kept item is SETTLED — "a person already decided this page"
 * — never a failure, never silently a success.
 */
export interface SetPageIntentsKeptRow {
  ok: true;
  page_id: string;
  url?: string;
  kept_existing: { source: string; state: string };
}

export interface SetPageIntentsOutcome {
  /** The frozen result, as typed today. */
  result: SetPageIntentsResult;
  set: number;
  kept: number;
  failed: number;
  setPageIds: string[];
  keptRows: SetPageIntentsKeptRow[];
  failedRows: { page_id?: string; url?: string; error: string }[];
}

export interface PagesBulkActionsProps {
  context: PagesWorkspaceContext;
  /** The checked rows that are LOADED on this page of results. */
  selected: readonly PageIntentItem[];
  /** Every checked id (selection can outlive a page change). */
  selectedIds: readonly string[];
  /** Called after a write settled (set, kept or failed) so the host can clear the selection. */
  onSettled: (outcome: SetPageIntentsOutcome) => void;
}

export interface IntentReviewDeckProps {
  context: PagesWorkspaceContext;
  /** The proposed intents to review, in list order. */
  items: readonly PageIntentItem[];
  onSettled: (outcome: SetPageIntentsOutcome) => void;
}

export interface MapRunControlsProps {
  context: PagesWorkspaceContext;
}
