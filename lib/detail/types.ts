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
  /** Source health for synced records. Omit / return null for owned records. */
  health?: ((row: Row) => DetailSourceHealth | null) | null;
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
