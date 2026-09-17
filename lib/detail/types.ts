// lib/detail/types.ts
//
// The Detail primitive's contract. ONE core per record type; the wrapper
// yields three presentations (window | docked | page) from that one
// registration. Nothing in this file knows how a record is fetched, how a
// window is drawn, or which app hosts it — every app-specific capability
// arrives through `DetailHostPorts` (see host.tsx), which is what makes this
// directory a package waiting for a `mv` rather than a rewrite.

import type { ComponentType, ReactNode } from "react";

/** The three ways a record detail can show. `window` is the platform default. */
export const DETAIL_PRESENTATIONS = ["window", "docked", "page"] as const;
export type DetailPresentation = (typeof DETAIL_PRESENTATIONS)[number];

/**
 * The knob every presentation decision reads (`platform.feature_knob`,
 * feature `ui.detail`, key `default_presentation`; seeded by
 * `migrations/detail_presentation_knob.sql`). Enum of DETAIL_PRESENTATIONS,
 * overridable by organization, table (per record type) and user.
 */
export const DETAIL_PRESENTATION_KNOB = "ui.detail.default_presentation";

/**
 * The PER-RECORD-TYPE override of the setting above (`platform.feature_knob`,
 * feature `ui.detail`, key `presentation_by_type`): a json object keyed by
 * record type token, e.g. `{"file": "docked"}`. Nearest wins over
 * `default_presentation` for the type it names, and the same organization →
 * user ladder resolves it, so an organization can set "contracts open as a
 * page" and a person can still choose otherwise for themselves.
 *
 * WHY A SECOND KEY AND NOT THE `table` RUNG. The platform's per-table rung
 * (DD-131, precedence 50) is keyed by a `platform.entity_types` ROW ID, and
 * that table is admin-only by a restrictive policy — a browser cannot read the
 * id, so a `table` rung would be a setting the screen offers and the reader
 * never honours. One json key on the ladder the client already has is the
 * override the settings platform supports today.
 */
export const DETAIL_PRESENTATION_BY_TYPE_KNOB = "ui.detail.presentation_by_type";

/**
 * How many records of the list a detail was opened FROM may ride the page
 * presentation's URL (`platform.feature_knob`, feature `ui.detail`, key
 * `list_context_max_ids`; seeded by
 * `migrations/detail_list_context_max_knob.sql`). Organization-overridable.
 *
 * Why a knob and not a constant: it is a ceiling, and every ceiling here is a
 * row an admin owns (`common-docs/policies/limits-are-knobs-agents-set-them.md`).
 * Why it exists at all: uncapped, a 500-row list produced a >20 KB href no
 * server accepts (NEW-7, VERIFY-U-P1-R2). Beyond the cap the URL carries the
 * window around the current record and the detail says the list was trimmed.
 */
export const DETAIL_LIST_CONTEXT_MAX_KNOB = "ui.detail.list_context_max_ids";

/**
 * The cap when the knob has not answered yet (a cold cache, a signed-out
 * render, a host that binds no settings ladder). 100 `type.id` pairs with uuid
 * ids is the most the strictest presentation's FINAL URL can carry inside the
 * budget below, and it is far more neighbours than a person arrows through in
 * one sitting.
 */
export const DEFAULT_DETAIL_LIST_CONTEXT_MAX = 100;

/**
 * 🚨 NEW-19 (VERIFY-U-P1-R4) — THE BUDGET BELONGS TO THE FINAL URL, ONCE.
 *
 * It used to be 6,000 characters measured on the list VALUE, one escaping layer
 * too early, and nothing bounded the whole address:
 *
 *   * a detail window's deep link measured 5,992 against that 6,000 and reached
 *     the address bar at 7,416, because `UrlPanelManager` writes the `?panels=`
 *     token through `new URLSearchParams(...).toString()`, which re-escapes
 *     every `%` the token's own escaping already produced (a uuid's `-` goes
 *     `-` → `%2D` → `%252D`);
 *   * a detail PAGE that also carried an open window was 13,433 characters —
 *     its own `?l=` plus the merged `panels=` — past the 8 KB request line, so
 *     the edge answers 414 and the link is dead (VERIFY-U-P1-R4, NEW-19).
 *
 * 8,000 characters is the strictest edge in front of this platform (an 8 KB
 * request line), and the method, the path, every other parameter and the
 * token's own non-list args share it: a caller passes what the rest of the URL
 * already costs as `reservedBytes` and `trimListContext` measures the FINAL
 * serialized form. No caller may skip it, and the record SAYS what was cut
 * (`trimmedFrom`).
 */
export const DETAIL_URL_BUDGET_BYTES = 8000;

/**
 * The hard ceiling on the knob — the number of records the final URL can really
 * carry in EVERY presentation, so a value below it always changes what travels.
 *
 * 🚨 NEW-20 (VERIFY-U-P1-R4). The ceiling was 500 while the byte budget stopped
 * a uuid list at 139, so every value an administrator could set from 139 to 500
 * behaved identically and the knob's own live basis text told them 200 records
 * would travel. Measured against the final URL: 100 uuid entries under a short
 * type token cost ~6.7 KB in the window's `?panels=` token (the strictest
 * spelling) and ~4.3 KB in the page query, both inside the budget above; 150
 * costs ~10 KB in the token and does not fit. `migrations/
 * detail_list_context_max_deliverable.sql` lowers the knob's own `max_value`
 * and default to the same number and rewrites its basis text, so the settings
 * screen cannot offer records the URL can never carry. A longer type token
 * still trims below the cap — and still says so.
 */
export const DETAIL_LIST_CONTEXT_MAX_IDS_CEILING = 100;

/**
 * The knob's value as a usable cap; the default for anything that is not one,
 * and never more than the ceiling the byte budget can honour (NEW-12). The ONE
 * place the knob is turned into a number — the page href builder, the window's
 * deep-link token and the trim itself all read it through here.
 */
export function detailListContextMax(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  const asked = Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : DEFAULT_DETAIL_LIST_CONTEXT_MAX;
  return Math.min(asked, DETAIL_LIST_CONTEXT_MAX_IDS_CEILING);
}

/** The per-type entry for `type`, when the map holds a usable one. */
export function presentationForTypeFromMap(
  raw: unknown,
  type: string,
): DetailPresentation | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = (raw as Record<string, unknown>)[type];
  return isDetailPresentation(value) ? value : undefined;
}

export function isDetailPresentation(value: unknown): value is DetailPresentation {
  return (
    typeof value === "string" &&
    (DETAIL_PRESENTATIONS as readonly string[]).includes(value)
  );
}

/** A record, named the way the platform names records: type token + id. */
export interface DetailRef {
  type: string;
  id: string;
}

/** What the opener already knows, shown instantly until the row loads. */
export interface DetailSeed {
  name?: string | null;
  about?: string | null;
}

/**
 * The list the record was opened FROM, so `[` / `]` move to the previous /
 * next record without going back to the list. Plain data — it travels through
 * Redux and the URL.
 */
export interface DetailListContext {
  items: DetailRef[];
  index: number;
  /**
   * Set when this list is a WINDOW cut out of a longer one (the page
   * presentation carries the list in the URL and it is capped —
   * `ui.detail.list_context_max_ids`): the length of the list it was cut from,
   * so the detail can say the neighbours beyond it are not reachable from here
   * instead of presenting the window as the whole list (NEW-7).
   */
  trimmedFrom?: number;
}

/** What `useOpenDetail` accepts. */
export interface DetailOpenRequest extends DetailRef {
  /** Skip the setting and open this way. Omit to honour the user's setting. */
  presentation?: DetailPresentation;
  seed?: DetailSeed | null;
  list?: DetailListContext | null;
}

/** The payload a presentation receives — everything an open request carried. */
export interface DetailInstanceData extends DetailRef {
  seed: DetailSeed | null;
  list: DetailListContext | null;
}

// ─── The record-type contract ───────────────────────────────────────────────

export type DetailRow = Record<string, unknown>;

export type DetailLoadResult<Row extends DetailRow = DetailRow> =
  | { row: Row }
  | { notFound: true };

/** One rendered field. `ref` makes the value a door instead of text. */
export interface DetailField {
  key: string;
  label: string;
  text: string;
  /** Render in a monospace block (JSON, long identifiers). */
  mono?: boolean;
  /** This value names another record — render it as a door. */
  ref?: { token: string; id: string } | null;
}

/**
 * The "source health strip" for a synced record — where it came from, when it
 * was last refreshed, whether the grant behind it still works, and how to open
 * it at the source. Absent for records the platform owns outright.
 */
export interface DetailSourceHealth {
  /** Human name of the source ("Google Drive", "Search Console"). */
  source: string;
  lastRefreshedAt?: string | null;
  grant: "ok" | "expired" | "revoked" | "missing" | "unknown";
  /** One sentence for the grant state, in the person's language. */
  grantDetail?: string | null;
  openAtSourceHref?: string | null;
  /** Offered when the grant is not `ok`. The host decides what it does. */
  onReconnect?: (() => void) | null;
  /** Offered when the record can be refreshed on demand. */
  onRefresh?: (() => void | Promise<void>) | null;
}

/** What a `health` producer is told about the record it is answering for. */
export interface DetailHealthContext {
  ref: DetailRef;
  /** Aborted when the record changes or the detail closes. */
  signal: AbortSignal;
}

/**
 * The health producer: sync or async, and free to answer `null` for a record
 * that is not synced. A throw or a rejection is rendered as an honest "we could
 * not check the connection" strip, never as silence (`useDetailHealth`).
 */
export type DetailHealthProducer<Row extends DetailRow = DetailRow> = (
  row: Row,
  ctx: DetailHealthContext,
) => DetailSourceHealth | null | Promise<DetailSourceHealth | null>;

/** An extra section a record type adds under the fixed ones. */
export interface DetailSection {
  id: string;
  label: string;
  content: ReactNode;
}

/** What a registration's optional `Frame` and sections receive. */
export interface DetailFrameContext {
  ref: DetailRef;
  recordType: DetailRecordType;
  title: string;
  about: string | null;
  status: DetailStatus;
  fields: DetailField[];
  presentation: DetailPresentation;
}

/**
 * ONE registration per record type. The core component (header + fixed
 * sections) is derived from this; a record type never writes presentation
 * code. Everything optional degrades to "section absent", never to a dead
 * or disabled-looking control.
 */
export interface DetailRecordType<Row extends DetailRow = DetailRow> {
  /** The type token this registration answers for (as opened). */
  type: string;
  /** Human label ("Task", "File"). */
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Accent classes for the icon and type chip; semantic tokens only. */
  accent?: { text: string; bg: string; ring: string } | null;
  /**
   * The canonical entity-registry token for doors, associations and history.
   * `null` when the type is not a registry entity — the header then offers
   * copy-id only, and the associations / history sections are absent.
   */
  entityToken: string | null;
  /**
   * Load the full row. `null` when the type has no single canonical source
   * (the detail then renders from the seed alone and says so).
   */
  load: ((id: string, signal: AbortSignal) => Promise<DetailLoadResult<Row>>) | null;
  /** The title to show; receives the loaded row (or null) and the seed. */
  title: (row: Row | null, seed: DetailSeed | null) => string;
  /** The field list for the fields section. */
  fields: (row: Row) => DetailField[];
  /**
   * 🚨 PLAN §4 — THE SOURCE HEALTH STRIP'S PRODUCER. Source health for a SYNCED
   * record; omit it, or answer `null`, for a record the platform owns outright.
   *
   * It may be ASYNC, because whether the grant behind a synced record still works
   * is not in the row — it is the connector's recorded per-capability health, read
   * from the server. The host wires this field when it registers the record type
   * (in matrx-frontend, `resolveItemDetailType`, from the connectors' own
   * `productHealth`; never a second reader of `capability_health`), and
   * `useDetailHealth` resolves it. Until 2026-09-17 nothing set it, so the strip
   * could not render on any record and the §5.3 promise — a refusal anywhere shows
   * on every dependent record with the same Reconnect — had no witness
   * (VERIFY-U-P1-R4).
   */
  health?: DetailHealthProducer<Row> | null;
  /**
   * Tokens the associations section shows. `null` hides the section.
   * Omitted → the host's default set minus this record's own token.
   */
  associationTokens?: string[] | null;
  /** Show the history section (row versions). Default: when `entityToken` is set. */
  history?: boolean;
  /** Extra sections under the fixed ones. */
  extraSections?: ((row: Row | null, ctx: DetailFrameContext) => DetailSection[]) | null;
  /**
   * Wraps the whole body (surface runtime, right-click menu, …). Receives the
   * live context so a host can expose the dossier to its agents. Optional.
   */
  Frame?: ComponentType<{ ctx: DetailFrameContext; children: ReactNode }> | null;
}

export type DetailStatus =
  | "loading"
  | "ready"
  | "not-found"
  | "error"
  /** The type has no `load` — rendered from the seed alone. */
  | "none";

export type DetailLoadState<Row extends DetailRow = DetailRow> =
  | { status: "loading" }
  | { status: "ready"; row: Row }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "none" };

/** One row of the history section. */
export interface DetailHistoryEntry {
  version: number;
  operation: string;
  actorId: string | null;
  occurredAt: string;
  isCurrent: boolean;
}
