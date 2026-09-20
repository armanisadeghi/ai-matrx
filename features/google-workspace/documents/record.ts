/**
 * Docs Plane C — the pure record logic. No React, no network, no clock of its
 * own: every function that needs "now" is handed one, so the staleness rule and
 * the sentences are testable without pretending time passed.
 */

import type {
  GoogleDocumentMimeKind,
  GoogleDocumentRow,
  GoogleDocumentSyncStatus,
} from "./types";
import type { DetailField, DetailRow } from "@/lib/detail/types";

/** The item-presentation / entity token. Google's own noun (PLAN Amendment A2). */
export const GOOGLE_DOCUMENT_TYPE = "google_document";

/** The connector product this record's freshness depends on. */
export const GOOGLE_DOCUMENT_PRODUCT_KEY = "workspace_files";

/**
 * THE DEFAULT WHEN THE KNOB HAS NOT ANSWERED — `google.refresh.on_open_min_age_seconds`
 * (PLAN §7, default 300, organization- and user-overridable). A cold cache, a
 * signed-out render or a missing row must not mean "refresh on every open", which
 * would spend a Google call per keystroke of navigation.
 */
export const DEFAULT_REFRESH_ON_OPEN_MIN_AGE_SECONDS = 300;

export function isGoogleDocumentSyncStatus(
  value: unknown,
): value is GoogleDocumentSyncStatus {
  return value === "available" || value === "unavailable" || value === "detached";
}

/**
 * The schema-qualified table the server's two generic doors address this record
 * by (`SYNCED_RECORD_TABLES` in aidream's `google_sync/records.py`). Sent as a
 * path segment and resolved there against the declared set — never interpolated.
 */
export const GOOGLE_DOCUMENT_TABLE = "workbench.google_document";

/** The status word, or `unavailable` when the column says something we do not know. */
export function syncStatusOf(row: GoogleDocumentRow): GoogleDocumentSyncStatus | "unknown" {
  return isGoogleDocumentSyncStatus(row.sync_status) ? row.sync_status : "unknown";
}

const MIME_KIND_LABEL: Readonly<Record<GoogleDocumentMimeKind, string>> = {
  document: "Google Doc",
  spreadsheet: "Google Sheet",
  other: "Google Drive file",
};

/** What a person calls this file. Never the wire token. */
export function mimeKindLabel(mimeKind: string): string {
  return mimeKind in MIME_KIND_LABEL
    ? MIME_KIND_LABEL[mimeKind as GoogleDocumentMimeKind]
    : "Google Drive file";
}

const OPEN_AT_SOURCE_LABEL: Readonly<Record<GoogleDocumentMimeKind, string>> = {
  document: "Open in Google Docs",
  spreadsheet: "Open in Google Sheets",
  other: "Open in Google Drive",
};

/**
 * 🚨 F-66 — the open control's label reads the ROW'S OWN KIND, never the title
 * or a guess. `health.source` for this record answers for a whole family
 * ("Google Docs, Sheets & Drive files"), so `DetailBody`'s own derivation can
 * only ever say "Open in Google" — true, but not what the person can tell from
 * looking at the row: `mime_kind` (the same field `googleFileHref` branches on
 * to pick the URL shape) says whether this file IS a Doc, a Sheet, or plain
 * Drive, and this label says that back to them.
 */
export function googleDocumentOpenAtSourceLabel(mimeKind: string): string {
  return mimeKind in OPEN_AT_SOURCE_LABEL
    ? OPEN_AT_SOURCE_LABEL[mimeKind as GoogleDocumentMimeKind]
    : "Open in Google Drive";
}

/**
 * 🚨 THE HEALTH STRIP READS THE ROW, AND THIS ROW DOES NOT NAME ITS PROVIDER.
 *
 * `features/item-presentation/sourceHealth.ts` decides a record is a mirror by
 * looking for a `provider` column plus an external identity.
 * `workbench.google_document` has NO `provider` column — the table IS Google's —
 * so without this the strip would answer `null` for every one of these records
 * and the section the plan calls fixed would simply be absent.
 *
 * So the registration says out loud what the table already knows, and nothing
 * more: `provider` is the table's own subject and `provider_product` is the
 * product whose grant really refreshes it. It is additive — every real column is
 * still there for the fields, the doors and the history.
 *
 * The CONNECTION is not renamed here any more (lane F-51): the producer reads
 * `synced_via_connection_id`, which is what this table and every other synced
 * table actually call it.
 */
export function googleDocumentDetailRow(row: GoogleDocumentRow): DetailRow {
  return {
    ...row,
    provider: "google",
    provider_product: GOOGLE_DOCUMENT_PRODUCT_KEY,
  };
}

/** The row back out of the projection, for a caller that holds a `DetailRow`. */
export function asGoogleDocumentRow(row: DetailRow | null): GoogleDocumentRow | null {
  if (!row || typeof row.id !== "string" || typeof row.external_id !== "string") return null;
  return row as unknown as GoogleDocumentRow;
}

/** Whole minutes between two instants, floored, never negative. */
function minutesBetween(fromIso: string, now: Date): number | null {
  const then = Date.parse(fromIso);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 60_000));
}

/** Seconds since the last refresh, or `null` when it has never been refreshed. */
export function secondsSinceRefresh(
  syncedAt: string | null,
  now: Date,
): number | null {
  if (!syncedAt) return null;
  const then = Date.parse(syncedAt);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 1000));
}

/**
 * Whether opening this record should spend a Google call. A record that has
 * NEVER been refreshed is stale by definition — that is the first open, and the
 * body is empty until it happens.
 */
export function isStaleForOpen(
  syncedAt: string | null,
  minAgeSeconds: number,
  now: Date,
): boolean {
  const age = secondsSinceRefresh(syncedAt, now);
  if (age === null) return true;
  return age >= minAgeSeconds;
}

/** "refreshed 4 minutes ago from Google" — the plan's own words, in the person's. */
export function refreshedPhrase(syncedAt: string | null, now: Date): string {
  if (!syncedAt) return "Never refreshed from Google";
  const minutes = minutesBetween(syncedAt, now);
  if (minutes === null) return "Never refreshed from Google";
  if (minutes < 1) return "Refreshed less than a minute ago from Google";
  if (minutes === 1) return "Refreshed 1 minute ago from Google";
  if (minutes < 60) return `Refreshed ${minutes} minutes ago from Google`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1
      ? "Refreshed 1 hour ago from Google"
      : `Refreshed ${hours} hours ago from Google`;
  }
  const days = Math.floor(hours / 24);
  return days === 1
    ? "Refreshed 1 day ago from Google"
    : `Refreshed ${days} days ago from Google`;
}

function whenText(value: string | null): string {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : parsed.toLocaleString();
}

/**
 * 🚨 A CURATED FIELD LIST, NEVER A COLUMN DUMP (V-16 N5). The generic
 * `fieldsFromRow` would print `body_text` — the whole cached document — as a
 * field, next to `version`, `metadata` and both audit columns, and the four facts
 * the plan names (owner, last edited in Google, refreshed when, through which
 * account) would be lost inside it. The body has its own section.
 */
export function googleDocumentFields(row: GoogleDocumentRow, now: Date): DetailField[] {
  const fields: DetailField[] = [
    { key: "mime_kind", label: "Kind", text: mimeKindLabel(row.mime_kind) },
    {
      key: "owner_email",
      label: "Owner in Google",
      text: row.owner_email ?? "Google did not say who owns this file",
    },
    {
      key: "external_modified_at",
      label: "Last edited in Google",
      text: whenText(row.external_modified_at),
    },
    { key: "synced_at", label: "Freshness", text: refreshedPhrase(row.synced_at, now) },
  ];
  if (row.synced_via_connection_id) {
    // THE DOOR LAW: the account a refresh runs through is a record, so it opens.
    fields.push({
      key: "synced_via_connection_id",
      label: "Refreshed through",
      text: row.synced_via_connection_id,
      ref: { token: "integration_connection", id: row.synced_via_connection_id },
    });
  } else {
    fields.push({
      key: "synced_via_connection_id",
      label: "Refreshed through",
      text: "No Google account has refreshed this yet",
    });
  }
  fields.push({
    key: "external_id",
    label: "Google file id",
    text: row.external_id,
    mono: true,
  });
  return fields;
}
