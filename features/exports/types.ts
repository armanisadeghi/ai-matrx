// features/exports/types.ts
//
// BRING YOUR EXPORT — the wire vocabulary for the aidream `/media` export
// endpoints (bare prefix, no version segment).
//
// 🚨 WHY THESE ARE HAND-WRITTEN, AND WHAT MUST HAPPEN NEXT.
// `lib/api/FEATURE.md` rule 1 is that request/response types are DERIVED from
// `types/python-generated/api-types.ts`, never hand-mirrored — a hand mirror
// drifts silently. These are a hand mirror, deliberately and temporarily.
//
// 2026-09-17, later the same day — the note above this line used to say the
// routes 404 and appear nowhere in `openapi.json`. That is now STALE: all seven
// ARE published (`/media/export-adapters`, `/media/exports`,
// `/media/exports/{id}`, and the four `/media/libraries/{id}/…` routes). There
// is still nothing to derive, for a different reason: every one of them is
// declared `-> dict[str, Any]` on the server, so its published response schema
// is `{"type": "object", "additionalProperties": true}` and a generated type
// would be `Record<string, unknown>`.
//
// And a hand mirror DID drift, exactly as the rule warns. `recognised_not_
// readable` below says `number`; the live server sent a LIST of `{label,
// block}` objects, and `/exports` died on React's "Objects are not valid as a
// React child" on every load until `./contract.ts` was written. So:
//   1. Nothing in this feature may trust these interfaces at runtime — every
//      response goes through `./contract.ts` first. That stays true even after
//      step 2.
//   2. The day the server declares real response MODELS, run
//        node scripts/sync-types.mjs --fast --url https://server.app.matrxserver.com
//      and replace every interface here with `components["schemas"]["…"]`
//      aliases. That is the one thing to delete; the parsers stay.
//
// 🚨 THERE IS NO BODY TEXT IN AN ITEM, ON PURPOSE. An export holds other
// people's words; browsing runs on metadata only. There is no endpoint that
// returns a message body and there must not be one, so nothing in this feature
// may render, request, cache or copy message text. `ExportItem` below is the
// whole of what a row can ever say.

/** One format we can be handed, whether or not we can read it. */
export interface ExportAdapter {
  key: string;
  label: string;
  /** Human list of what the file looks like — ".zip from Google Takeout". */
  accepts: string;
  /**
   * False = we RECOGNISE the format and cannot read it. The screen still lists
   * it, with `block` as the reason, so dropping one is never "unknown file".
   */
  implemented: boolean;
  /** The sentence to show when we cannot read it. Present iff !implemented. */
  block?: string | null;
}

export interface ExportAdapterCatalog {
  adapters: ExportAdapter[];
  /** How many formats we can actually read. */
  readable: number;
  /** How many we recognise but cannot read. */
  recognised_not_readable: number;
}

/** What the server decided the uploaded bytes are. */
export interface ExportDetection {
  adapter: string;
  adapter_label: string;
  confidence: number;
  /** A SENTENCE naming what in the bytes decided. Always shown to the person. */
  detected_from: string;
}

export interface ExportLibrary {
  id: string;
  name: string;
  file_id?: string | null;
  adapter?: string | null;
  adapter_label?: string | null;
  detected_from?: string | null;
  status?: string | null;
  bytes?: number | null;
  total_items?: number | null;
  visibility?: string | null;
  organization_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  summary?: ExportSummary | null;
}

export interface CreateExportResponse {
  library: ExportLibrary;
  detected: ExportDetection;
}

/** `{ "value": count }` maps the server returns for every grouped count. */
export type CountMap = Record<string, number>;

export interface ExportCorrespondent {
  key: string;
  label: string;
  count: number;
}

export interface ExportDateRange {
  earliest: string | null;
  latest: string | null;
  span_days: number | null;
}

/**
 * The "within seconds you see what it is" payload. Arrives on
 * `library.index.completed`, and again from the library read on every later
 * mount — the stream is never the only copy.
 */
export interface ExportSummary {
  total_items: number;
  counts_by_kind: CountMap;
  counts_by_direction: CountMap;
  counts_by_label: CountMap;
  counts_by_container: CountMap;
  date_range: ExportDateRange;
  top_correspondents: ExportCorrespondent[];
  total_chars: number;
  total_words: number;
  with_attachments: number;
  /** Who the export belongs to, as the bytes revealed it. May be null. */
  owner_identity: string | null;
  /**
   * WHY we believe that. Shown beside every "sent by me" control, so the
   * filter is never a mystery. Null when `owner_identity` is null.
   */
  owner_identity_basis: string | null;
  warnings: string[];
}

// ─── The index stream ────────────────────────────────────────────────────────

export interface IndexStartedEvent {
  type: "library.index.started";
  library_id: string;
  seq: number;
  at: string;
  adapter: string;
  adapter_label: string;
  detected_from: string;
  bytes: number;
}

export interface IndexPageEvent {
  type: "library.index.page";
  library_id: string;
  seq: number;
  at: string;
  cumulative: number;
  elapsed_ms: number;
}

export interface IndexCompletedEvent {
  type: "library.index.completed";
  library_id: string;
  seq: number;
  at: string;
  total_indexed: number;
  elapsed_ms: number;
  summary: ExportSummary;
}

export interface IndexFailedEvent {
  type: "library.index.failed";
  library_id: string;
  seq: number;
  at: string;
  /** What HAD been indexed when it broke — offered with the retry, never hidden. */
  partial_total: number;
  message: string;
}

export type IndexEvent =
  | IndexStartedEvent
  | IndexPageEvent
  | IndexCompletedEvent
  | IndexFailedEvent;

// ─── Items ───────────────────────────────────────────────────────────────────

export interface ExportItemParty {
  name: string | null;
  email: string | null;
  handle: string | null;
}

/** ONE extracted thing. Metadata only — there is no body field, by design. */
export interface ExportItem {
  id: string;
  external_id: string | null;
  kind: string;
  title: string | null;
  direction: "outbound" | "inbound" | "unknown" | string;
  author: ExportItemParty | null;
  recipients: ExportItemParty[];
  occurred_at: string | null;
  container_id: string | null;
  container_label: string | null;
  labels: string[];
  char_count: number;
  word_count: number;
  attachment_count: number;
  attachment_names: string[];
  is_reply: boolean;
}

/** Every narrowing axis the items endpoint understands. */
export interface ExportItemFilter {
  /**
   * A named preset id from `/media/libraries/{id}/presets`.
   *
   * A preset REPLACES the rest of this filter rather than combining with it —
   * the server ignores the other keys when it is set. That is deliberate: two
   * of the presets ("my longest replies", "threads I replied to more than
   * twice") cannot be expressed as column comparisons at all, and letting a
   * preset half-merge with whatever was already ticked would mean the sentence
   * the person confirms no longer describes the rows they are looking at.
   */
  preset?: string;
  direction?: string;
  kind?: string;
  labels?: string;
  author?: string;
  container_id?: string;
  has_attachment?: boolean;
  occurred_after?: string;
  occurred_before?: string;
  min_chars?: number;
  max_chars?: number;
  q?: string;
}

export type ExportItemOrder =
  | "occurred_at"
  | "char_count"
  | "word_count"
  | "title"
  | "attachment_count";

export interface ExportItemsResponse {
  items: ExportItem[];
  /**
   * One honest sentence per item (or per item's recipient) this build could
   * not read — dropped, never guessed, and never taking the items that DID
   * read correctly down with it. See `mapListRows` in `lib/contract/narrow.ts`.
   */
  row_problems: string[];
  /** The WHOLE Library. Never `items.length`. */
  total: number;
  /** What the current filter matches. Never `items.length`. */
  filtered_total: number;
  limit: number;
  offset: number;
  /** The server's own words for the active filter. */
  filter_description: string;
}

export interface ExportItemFacets {
  direction: CountMap;
  item_kind: CountMap;
}

export interface SendToRulebookResponse {
  sent: number;
  rulebook_id: string;
  permit_id: string;
  confirmed_sentence: string;
  confirmed_at: string;
}
