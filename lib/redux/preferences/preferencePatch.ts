/**
 * lib/redux/preferences/preferencePatch.ts
 *
 * A preference save sends ONLY what this tab changed.
 *
 * `users.user_preferences.preferences` is one jsonb record shared by every tab,
 * every device and every agent acting for the person. Until 2026-09-27 the sync
 * engine saved the tab's WHOLE cached record (`update({ preferences: body })`),
 * so any save from a tab holding an older copy silently put that copy back —
 * observed live: an agent set `organization.defaultOrganizationId` at
 * 23:28:56 and it was null again at 23:29:11, written by a browser whose cache
 * still held the old record.
 *
 * Now a save is: diff the body against the record this tab last knew the
 * server held (`WriteContext.base`), keep the changed `module.field` leaves,
 * and merge exactly those into the CURRENT row through `mergeJsonColumn`
 * (compare-and-swap on `version`, re-read and re-merge on a lost race). A key
 * this tab did not change is never written, so it can never go back.
 *
 * Granularity is `module.field` — the unit every edit reducer writes
 * (`setPreference(module, preference)`); a field holding an object or array
 * (favorites.items, listViews.views) is one value. Two writers of the SAME
 * field still resolve last-write-wins, which is the honest answer for one
 * control changed in two places.
 */

import type { MaybeSingleResponse } from "@ai-matrx/data";
import { asJsonObject, mergeJsonColumn, type JsonObject } from "@ai-matrx/data/db";

/** One changed leaf: `field === null` means the whole module value changed shape. */
export interface PreferenceChange {
  module: string;
  field: string | null;
  /** `undefined` = the key was removed. */
  value: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Structural equality, key-order independent (jsonb does not keep key order). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!sameJson(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!sameJson(a[k], b[k])) return false;
    return true;
  }
  return false;
}

/**
 * What `body` changed relative to `base`, at `module.field` granularity, over
 * the given modules only (the persisted modules — `_meta` never travels).
 */
export function diffPreferences(
  base: unknown,
  body: unknown,
  modules: readonly string[],
): PreferenceChange[] {
  const from = isPlainObject(base) ? base : {};
  const to = isPlainObject(body) ? body : {};
  const changes: PreferenceChange[] = [];
  for (const module of modules) {
    const before = from[module];
    const after = to[module];
    if (sameJson(before, after)) continue;
    if (isPlainObject(before) && isPlainObject(after)) {
      const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const field of fields) {
        if (!sameJson(before[field], after[field])) {
          changes.push({ module, field, value: after[field] });
        }
      }
    } else if (isPlainObject(after)) {
      // No usable base for this module: every field it holds is this tab's.
      for (const [field, value] of Object.entries(after)) {
        changes.push({ module, field, value });
      }
    } else {
      changes.push({ module, field: null, value: after });
    }
  }
  return changes;
}

/** Apply changes onto the CURRENT record. Pure; never touches an unchanged key. */
export function applyPreferenceChanges(
  current: JsonObject,
  changes: readonly PreferenceChange[],
): JsonObject {
  const next: JsonObject = { ...current };
  for (const { module, field, value } of changes) {
    if (field === null) {
      if (value === undefined) delete next[module];
      else next[module] = value;
      continue;
    }
    const moduleValue: Record<string, unknown> = isPlainObject(next[module])
      ? { ...(next[module] as Record<string, unknown>) }
      : {};
    if (value === undefined) delete moduleValue[field];
    else moduleValue[field] = value;
    next[module] = moduleValue;
  }
  return next;
}

export interface PreferencesRow {
  user_id: string;
  version: number;
  preferences: unknown;
}

/** The columns both queries select. */
export const PREFERENCES_ROW_COLUMNS = "user_id, version, preferences";

export type PreferencePatchOutcome =
  | { status: "unchanged" }
  | { status: "saved"; changed: number; version: number };

/**
 * Save only what changed between `base` and `body`, merged into the live row.
 * Throws with words on every failure — the sync engine logs it, keeps the old
 * base, and sends the same changes again with the next save.
 */
export async function savePreferencePatch(args: {
  base: unknown;
  body: unknown;
  modules: readonly string[];
  /** Read the row by `user_id` alone, selecting `PREFERENCES_ROW_COLUMNS`, `.maybeSingle()`. */
  fetchCurrent: () => PromiseLike<MaybeSingleResponse<PreferencesRow>>;
  /**
   * The guarded UPDATE: `{ preferences: value, version: nextVersion }`,
   * `.eq("user_id", …).eq("version", expectedVersion)`, selecting
   * `PREFERENCES_ROW_COLUMNS`, `.maybeSingle()`.
   */
  applyUpdate: (next: {
    value: JsonObject;
    expectedVersion: number;
    nextVersion: number;
  }) => PromiseLike<MaybeSingleResponse<PreferencesRow>>;
}): Promise<PreferencePatchOutcome> {
  const { base, body, modules, fetchCurrent, applyUpdate } = args;
  const changes = diffPreferences(base, body, modules);
  if (changes.length === 0) return { status: "unchanged" };

  const result = await mergeJsonColumn<PreferencesRow>({
    fetchCurrent,
    readColumn: (row) => row.preferences,
    merge: (current) => applyPreferenceChanges(asJsonObject(current), changes),
    applyUpdate,
  });

  switch (result.status) {
    case "saved":
      return { status: "saved", changed: changes.length, version: result.row.version };
    case "not_found":
      throw new Error(
        "Your preferences could not be saved: this account has no preferences record. " +
          "Sign out and back in; if it persists, report it so the record can be restored.",
      );
    case "conflict":
      throw new Error(
        "Your preferences could not be saved: the record kept changing while saving. " +
          "Your change is kept and will be sent again with the next save.",
      );
    case "error":
      throw result.error instanceof Error
        ? result.error
        : new Error(
            `Your preferences could not be saved: ${
              (result.error as { message?: string } | null)?.message ?? String(result.error)
            }`,
          );
  }
}
