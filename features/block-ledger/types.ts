// features/block-ledger/types.ts
//
// THE BLOCK LEDGER — one row per failed acquisition, anywhere on the platform.
// Written by aidream/services/block_ledger, read here.
//
// The vocabularies below are the SAME closed sets the database carries as CHECK
// constraints and aidream declares in `block_ledger/vocabulary.py`. They are
// repeated as labels only: a value nobody listed still renders (as itself), because
// a facet that silently drops a row is worse than one with an unfamiliar word in it.

export interface AcquisitionBlock {
  id: string;
  input_ref: string;
  input_label: string;
  source_type: string;
  engine: string;
  rung: string | null;
  rung_trail: unknown;
  error_class: string;
  error_sentence: string;
  unblock_note: string;
  lawful_route: string | null;
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  status: string;
  retry_count: number;
  last_retry_at: string | null;
  handoff_id: string | null;
  library_id: string | null;
  organization_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const ENGINE_LABELS: Record<string, string> = {
  scraper: "Scraper",
  server_browser: "Server browser",
  own_browser: "Your own browser",
  human: "You, driving",
  file_reader: "File reader",
  catalog_adapter: "Catalog adapter",
  export_reader: "Export reader",
  connected_account: "Connected account",
};

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  web_page: "Web page",
  video_channel: "Video channel",
  podcast_feed: "Podcast feed",
  blog_feed: "Blog or feed",
  slide_deck: "Slide deck",
  file: "File",
  export: "Export",
  connected_account: "Connected account",
  search: "Search",
};

/** The four rungs, in the ladder's own order and words. */
export const RUNG_LABELS: Record<string, string> = {
  http: "1 — Scraper",
  browser: "2 — Server browser",
  own_browser: "3 — Your own browser",
  human_drive: "4 — You, driving",
};

export const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  retrying: "Retrying",
  resolved: "Resolved",
  escalated: "Escalated",
  decision: "Needs a decision",
};

/** Unknown values answer with themselves rather than with a blank. */
export function labelFor(
  table: Record<string, string>,
  value: string | null | undefined,
): string {
  if (!value) return "—";
  return table[value] ?? value;
}

/**
 * Which blocks a retry could possibly clear. A block whose only lawful route
 * crosses DRM, a paywall, somebody else's login or a permission we never asked
 * for is NOT one of them — re-running the ladder against it would burn the
 * org's quota to reproduce the same refusal, and the screen says so instead of
 * offering a button that cannot work.
 */
export function isRetryable(row: AcquisitionBlock): boolean {
  return row.status !== "decision" && row.status !== "resolved";
}

/** Which blocks a person's own logged-in browser could plausibly beat. */
export const OWN_BROWSER_CLASSES = new Set([
  "login_wall",
  "paywall",
  "bad_status",
  "cloudflare_block",
  "empty_content",
  "thin_content",
  "low_text_content",
  "wrong_resource",
]);

export function canGoToYourBrowser(row: AcquisitionBlock): boolean {
  return (
    row.source_type === "web_page" &&
    OWN_BROWSER_CLASSES.has(row.error_class) &&
    row.status !== "resolved"
  );
}
