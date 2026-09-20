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
  // NOT NUMBERED, because it is not a rung. Residential egress is the same
  // step run again from the person's own connection — `OPTIONAL_RUNGS` in
  // `features/capture-ladder/types.ts`. It appears in real `rung_trail`s on
  // the live table, and `labelFor` answers an unknown key with the key
  // itself, so without this line the block dialog printed the bare word
  // "residential" at a person on the one screen whose job is to explain.
  residential: "— Retried from your connection",
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
 * Which blocks a retry could possibly clear — the SAME rule the server enforces
 * (`aidream/services/block_ledger/actions.py` RETRYABLE_STATUSES). It lives here only
 * so the confirm dialog can count honestly before the call; the server decides.
 *
 * A block whose only lawful route crosses DRM, a paywall, someone else's login or a
 * permission we never asked for lands as `decision` and is never retried: re-running it
 * would spend the organization's quota to reproduce the same refusal.
 */
export function isRetryable(row: AcquisitionBlock): boolean {
  return row.status === "open" || row.status === "retrying" || row.status === "escalated";
}

/**
 * Which blocks a person's own logged-in browser could be asked to open — again the
 * server's rule (`link_handoffs`), mirrored only for the confirm's count.
 *
 * It is deliberately NOT narrowed to the ladder's own escalation classes: a person
 * pressing this button has already made that judgement themselves, which is exactly
 * what the capture ladder's `asked_by_a_person` class exists for.
 */
export function canGoToYourBrowser(row: AcquisitionBlock): boolean {
  return (
    row.source_type === "web_page" &&
    /^https?:\/\//.test(row.input_ref) &&
    row.status !== "resolved"
  );
}
