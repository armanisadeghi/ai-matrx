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
  | "picklist"
  | "workbook"
  | "document"
  | "message"
  | "email";

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
