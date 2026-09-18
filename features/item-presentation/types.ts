/**
 * Item Presentation — types
 *
 * A render block that turns a tiny `{ id, type, name, about }` payload from an
 * agent into a beautiful, clickable card that (a) renders instantly the moment
 * the block is recognized, (b) auto-enriches itself from the database, and
 * (c) opens the matching window panel on click.
 *
 * The block is intentionally forgiving: ANY `type` string renders — recognized
 * types get a custom icon/accent + enrichment + a real "Open" action; unknown
 * types fall back to a neutral-but-pretty card that never errors.
 */

/**
 * The known item types. This list is the *current* set — adding a new one is a
 * single entry in `ITEM_PRESENTATION_REGISTRY`. The `string & {}` keeps the
 * union open so an unrecognized type from the model is still a valid value
 * (it routes to the fallback renderer rather than failing typecheck).
 */
export type KnownItemType =
  | "agent"
  | "app"
  | "note"
  | "task"
  | "project"
  | "scope_type"
  | "scope"
  | "context_item"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "session"
  | "table"
  | "structured_list"
  // "picklist" retained read-only for pre-rename historical payloads; new
  // payloads use "structured_list". See common-docs/projects/structured-lists-rename.
  | "picklist"
  | "workbook"
  | "document"
  | "conversation"
  | "message"
  | "email"
  // An existing Person (or company) in the CRM — `crm.party`. The CREATE form is
  // a different window; this is the record that already exists, which had no
  // in-place presentation of any kind before F-40.
  | "party"
  // A Google Doc, Sheet or Drive file a person picked, mirrored into
  // `workbench.google_document` (PLAN Amendment A2 names the table with Google's
  // own noun). The record is the projection; the picked-resource row stays the
  // authorization boundary (Amendment A1).
  | "google_document"
  // One owned Google Calendar event inside the agenda window, mirrored into
  // `communication.calendar_event` (aidream migration 0766). Read-only toward
  // Google: `visibility personal` by default (ruling R1), because a person's
  // agenda is theirs.
  | "calendar_event"
  // A Marketing SITE — `web.site`, the module's central identity (every Search
  // Console number, crawl, page and keyword belongs to one). The word is the
  // canonical `platform.entity_types` token, `web_site`, never a twin spelled
  // `site`: the token already carries the route and the peek, and only the
  // in-place opener was missing (F-87).
  | "web_site"
  // One synced YouTube video — `web.youtube_video`, the third Google mirror
  // table beside the Doc record and the calendar event. The word is the
  // canonical `platform.entity_types` token, `web_youtube_video`, never a twin
  // spelled `youtube_video` (that spelling is already an agent CONTENT BLOCK
  // type — a video someone pasted into a message — and is a different thing).
  | "web_youtube_video";

export type ItemType = KnownItemType | (string & {});

/** The raw payload an agent emits inside the ```json fence. */
export interface ItemPresentationPayload {
  id?: string | null;
  type?: ItemType | null;
  /** Optional human label the agent already knows — used until enrichment lands. */
  name?: string | null;
  /** Optional one-liner the agent already knows. */
  about?: string | null;
}

/** The block wrapper as it lives in the JSON the model produces. */
export interface ItemPresentationBlockData {
  item_presentation: ItemPresentationPayload;
}

/**
 * A single enriched detail row shown in the expanded card (e.g. "Status: Active").
 * Kept presentation-only — no semantics beyond label/value.
 */
export interface ItemDetail {
  label: string;
  value: string;
}

/** The result of enriching an item from the database. */
export interface EnrichedItem {
  /** Authoritative display name from the DB (overrides the agent's guess). */
  name?: string;
  /** Authoritative one-liner from the DB. */
  about?: string;
  /** Extra detail rows surfaced when the card expands. */
  details?: ItemDetail[];
  /** True when the row could not be found (deleted / wrong id / no access). */
  notFound?: boolean;
}

export type EnrichmentStatus =
  | "idle"
  | "loading"
  | "ready"
  | "not-found"
  | "error";
