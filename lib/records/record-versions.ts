// lib/records/record-versions.ts — ONE RULE, ONE PLACE: EVERY UPDATE OF AN EXISTING RECORD CARRIES
// THE VERSION THE PERSON SAW (lane 10 VIEWS-AND-FIELDS, sublane VWF, 2026-10-02).
//
// The store's `record_update`, `record_update_adding_choices` and `record_change_many` do a hard
// compare-and-set when handed a version and refuse with PT409 (`stale_write`); a write with NO
// version is last-write-wins (proven on the nightly clone, 2026-10-02). So a screen that forgets the
// version — or reads a fresh one just before it writes — silently overwrites a colleague.
//
// This file MIRRORS `@ai-matrx/records-ui`'s `src/recordVersions.ts` exactly: the same two labels, the
// same refusal for an unread version (never sent as "no version"), the same raise-only versions, the
// same write doors. It exists because the package's published tarball (0.93.146, checked with
// `npm pack`, 2026-10-02) does not export them yet.
// TODO(lane 10 VWF): once `@ai-matrx/records-ui` publishes `updateRecordAt` / `changeRecordsAt` /
// `restoreAt` / `readVersionNow` / `STALE_MOVE_LABEL` / `VERSION_UNREAD_LABEL`, import them from the
// package and keep only `VersionLedger` (the non-React twin of `useRecordVersions`) here.
//
// The census guard `lib/records/__tests__/every-update-carries-the-version-it-saw.test.ts` fails on
// any matrx-frontend call that updates a record without going through these doors.
//
// Pure TypeScript, no React, no "use client": the portal's server action imports it too.

import type { RecordChange, RecordChangeResult, RecordsError, RecordsResult, RestoreResult, Uuid } from "@ai-matrx/records";

/** THE CONFLICT — the store said somebody else won. The same label platform-wide. */
export const STALE_MOVE_LABEL = "Changed by someone else";
/** THE VERSION COULD NOT BE READ, so nothing was written — never shown as a conflict. */
export const VERSION_UNREAD_LABEL = "Could not check for changes";
/** The one action beside either label. */
export const RELOAD_LABEL = "Reload";

const UNREAD_SENTENCE = "Nothing was saved: this record's latest changes could not be checked.";
const UNREAD_REMEDY = "Reload, then try again.";
const SEEN_MOVED_SENTENCE = "Nothing was saved: someone else changed this record since you opened it.";

/** The package's own refusal shape (`records-ui/src/refusals.ts`), built here so a server file can use it. */
function refusal(code: RecordsError["code"], sentence: string, remedy: string): RecordsError {
  return { code, message: sentence, ours: true, hint: remedy } as RecordsError;
}

/** The refusal for "the version the person saw is not known". */
export function versionUnread(): RecordsError {
  return { ...refusal("stale_read" as RecordsError["code"], UNREAD_SENTENCE, UNREAD_REMEDY), detail: { version_unread: true } } as RecordsError;
}

/** Is this refusal "the version could not be read" (never "somebody else changed it")? */
export function isVersionUnread(error: { detail?: unknown } | null | undefined): boolean {
  const detail = error?.detail as { version_unread?: unknown } | undefined;
  return Boolean(detail && detail.version_unread === true);
}

/** Is this refusal "somebody else changed it first"? (`PT409` → `stale_write`.) */
export function isChangedElsewhere(error: { code?: unknown } | null | undefined): boolean {
  return error?.code === "stale_write" || error?.code === "PT409";
}

/** The label a version refusal wears, or null for every other refusal. */
export function versionRefusalLabel(error: { code?: unknown; detail?: unknown } | null | undefined): string | null {
  if (isVersionUnread(error)) return VERSION_UNREAD_LABEL;
  if (isChangedElsewhere(error)) return STALE_MOVE_LABEL;
  return null;
}

type HeadersClient = { recordHeaders(args: { ids: Uuid[] }): Promise<RecordsResult<Array<{ id: Uuid; version: number }>>> };

/** One record's version, read now — for a screen that shows something else first (a preview, a proposal). */
export async function readVersionNow(client: HeadersClient, id: string): Promise<number | null> {
  return (await readVersionsNow(client, [id])).get(id) ?? null;
}

/** Many records' versions, read now, in one call. A record the store did not answer is `null`. */
export async function readVersionsNow(client: HeadersClient, ids: readonly string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>(ids.map((id) => [id, null]));
  if (ids.length === 0) return out;
  try {
    const res = await client.recordHeaders({ ids: [...ids] as Uuid[] });
    if (!res.ok) return out;
    for (const h of res.data ?? []) if (out.has(h.id)) out.set(h.id, h.version);
  } catch {
    // A thrown read is an unread version, said as its own refusal by the write door.
  }
  return out;
}

/**
 * THE VERSIONS AT LOAD, for a data seam that is not a React screen (the Sheet's `record-store.ts`).
 * The non-React twin of the package's `useRecordVersions`: a read that DRAWS rows calls `drew`, which
 * reads their headers once; a write asks `seen`, which waits for that read; a write this browser made
 * calls `wrote`. A version only ever goes up. A failed read leaves the record unread, and the write
 * door refuses it with `VERSION_UNREAD_LABEL` — never a guess, never "no version".
 */
export class VersionLedger {
  private versions = new Map<string, number>();
  private unread = new Set<string>();
  private pending = new Map<string, { gen: number; read: Promise<void> }>();
  private generation = 0;

  private raise(id: string, version: number) {
    const held = this.versions.get(id);
    if (held === undefined || version > held) this.versions.set(id, version);
    this.unread.delete(id);
  }

  /** These rows were drawn: read their versions (one `record_headers` call). */
  drew(client: HeadersClient, ids: readonly string[]): Promise<void> {
    const toRead = [...new Set(ids)];
    if (toRead.length === 0) return Promise.resolve();
    this.generation += 1;
    const gen = this.generation;
    const read = readVersionsNow(client, toRead).then((found) => {
      for (const [id, version] of found) {
        if (this.pending.get(id)?.gen !== gen) continue;
        if (version === null) {
          this.versions.delete(id);
          this.unread.add(id);
        } else this.raise(id, version);
        this.pending.delete(id);
      }
    });
    for (const id of toRead) this.pending.set(id, { gen, read });
    return read;
  }

  /** A row's version came with the read itself (a history panel's newest entry). */
  drewAt(id: string, version: number) {
    this.raise(id, version);
  }

  /** The version the person saw this record at; waits for the read of freshly drawn rows. `null` = unread. */
  async seen(id: string): Promise<number | null> {
    for (let guard = 0; guard < 5; guard += 1) {
      const waiting = this.pending.get(id);
      if (!waiting) break;
      await waiting.read;
    }
    if (this.unread.has(id)) return null;
    return this.versions.get(id) ?? null;
  }

  async seenMany(ids: readonly string[]): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    for (const id of ids) out.set(id, await this.seen(id));
    return out;
  }

  /**
   * A WRITE THIS BROWSER MADE raised the record; its header is read once more, because `record_update`
   * answers the version from BEFORE the store's own automations ran (package verifier V10).
   */
  wrote(client: HeadersClient, id: string, version: number) {
    this.raise(id, version);
    void this.drew(client, [id]);
  }

  /** Forget everything (tests; a sign-out). */
  clear() {
    this.versions.clear();
    this.unread.clear();
    this.pending.clear();
  }
}

/* ═══ THE WRITE DOORS ════════════════════════════════════════════════════════════════════════ */

type UpdateClient = {
  recordUpdate(args: { record_id: Uuid; patch: never; expectedVersion?: number }): Promise<RecordsResult<number>>;
};

/** ONE record's update, against the version the person saw. */
export async function updateRecordAt(
  client: UpdateClient,
  args: { record_id: string; patch: Record<string, unknown>; version: number | null },
): Promise<RecordsResult<number>> {
  if (args.version === null) return { ok: false, error: versionUnread() };
  return client.recordUpdate({ record_id: args.record_id as Uuid, patch: args.patch as never, expectedVersion: args.version });
}

/** One change of a batch: an update NAMES the version it was made against (`null` = unread). */
export type VersionedChange =
  | Extract<RecordChange, { op: "insert" }>
  | Extract<RecordChange, { op: "archive" }>
  | { op: "update"; record_id: string; patch: Record<string, unknown>; expected_version: number | null };

/** MANY CHANGES TO ONE TABLE, ONE TRANSACTION. Any update with an unread version refuses the batch. */
export async function changeRecordsAt(
  client: { recordChangeMany(args: { table_id: Uuid; changes: RecordChange[] }): Promise<RecordsResult<RecordChangeResult[]>> },
  args: { table_id: string; changes: readonly VersionedChange[] },
): Promise<RecordsResult<RecordChangeResult[]>> {
  const sent: RecordChange[] = [];
  for (const change of args.changes) {
    if (change.op !== "update") {
      sent.push(change);
      continue;
    }
    if (change.expected_version === null) return { ok: false, error: versionUnread() };
    sent.push({ op: "update", record_id: change.record_id as Uuid, patch: change.patch as never, expected_version: change.expected_version });
  }
  return client.recordChangeMany({ table_id: args.table_id as Uuid, changes: sent });
}

/**
 * PUT A VERSION BACK (one column, or the whole record), only while the record is still at the version
 * the person saw. The restore doors take no expected version, so the check is ONE header read just
 * before — the same gap the package names (a write inside that one round trip can still slip past).
 */
export async function restoreAt(
  client: HeadersClient & {
    valueRestore(args: { record_id: Uuid; field_key: string; version: number }): Promise<RecordsResult<RestoreResult>>;
    restoreVersion(args: { record_id: Uuid; version: number }): Promise<RecordsResult<RestoreResult>>;
  },
  args: { record_id: string; version: number; field_key?: string | null; seenVersion: number | null },
): Promise<RecordsResult<RestoreResult>> {
  if (args.seenVersion === null) return { ok: false, error: versionUnread() };
  const now = await readVersionNow(client, args.record_id);
  if (now === null) return { ok: false, error: versionUnread() };
  if (now !== args.seenVersion) {
    return {
      ok: false,
      error: { ...refusal("stale_write" as RecordsError["code"], SEEN_MOVED_SENTENCE, UNREAD_REMEDY), detail: { expected_version: args.seenVersion, current_version: now } } as RecordsError,
    };
  }
  return args.field_key
    ? client.valueRestore({ record_id: args.record_id as Uuid, field_key: args.field_key, version: args.version })
    : client.restoreVersion({ record_id: args.record_id as Uuid, version: args.version });
}
