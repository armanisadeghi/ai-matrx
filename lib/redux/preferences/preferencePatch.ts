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
 * Granularity is the changed LEAF: objects are diffed key by key down to the
 * value that changed, and keyed lists (favorites.items,
 * aiModels.favoriteModels, listViews.<surface>.views) are merged by item
 * identity, so two tabs adding different items keep both. Two writers of the
 * SAME leaf still resolve last-write-wins — the honest answer for one control
 * changed in two places.
 */

import type { MaybeSingleResponse } from "@ai-matrx/data";
import { asJsonObject, mergeJsonColumn, type JsonObject } from "@ai-matrx/data/db";

/**
 * One change this tab made, at a path under the record (`["display","darkMode"]`,
 * `["listViews","agents-browse","views"]`).
 *  - `set`  — the leaf's new value (`undefined` = the key was removed).
 *  - `list` — a KEYED list (strings/numbers, or objects carrying a string `id`:
 *    favorites.items, aiModels.favoriteModels, listViews.<surface>.views). It
 *    carries what this tab added/changed and removed relative to its base, so a
 *    concurrent writer's additions to the same list survive.
 */
export type PreferenceChange =
  | { kind: "set"; path: string[]; value: unknown }
  | { kind: "list"; path: string[]; base: unknown[]; body: unknown[] };

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

type ListKey = string;

/** The identity of a keyed-list item, or null when the item has none. */
function itemKey(item: unknown): ListKey | null {
  if (typeof item === "string") return `s:${item}`;
  if (typeof item === "number") return `n:${item}`;
  if (isPlainObject(item) && typeof item.id === "string") return `id:${item.id}`;
  return null;
}

/** True when every item of both lists has an identity (so it can be merged by key). */
function isKeyedList(a: unknown[], b: unknown[]): boolean {
  if (a.length === 0 && b.length === 0) return false;
  return [...a, ...b].every((item) => itemKey(item) !== null);
}

function diffInto(
  before: unknown,
  after: unknown,
  path: string[],
  changes: PreferenceChange[],
): void {
  if (sameJson(before, after)) return;
  if (isPlainObject(after) && (isPlainObject(before) || before === undefined)) {
    const from = isPlainObject(before) ? before : {};
    const keys = new Set([...Object.keys(from), ...Object.keys(after)]);
    for (const key of keys) diffInto(from[key], after[key], [...path, key], changes);
    return;
  }
  if (Array.isArray(after) && (Array.isArray(before) || before === undefined)) {
    const from = Array.isArray(before) ? before : [];
    if (isKeyedList(from, after)) {
      changes.push({ kind: "list", path, base: from, body: after });
      return;
    }
  }
  changes.push({ kind: "set", path, value: after });
}

/**
 * What `body` changed relative to `base`, over the given modules only (the
 * persisted modules — `_meta` never travels). Recurses through objects to the
 * leaf that changed; keyed lists become item-level changes.
 */
export function diffPreferences(
  base: unknown,
  body: unknown,
  modules: readonly string[],
): PreferenceChange[] {
  const from = isPlainObject(base) ? base : {};
  const to = isPlainObject(body) ? body : {};
  const changes: PreferenceChange[] = [];
  for (const module of modules) diffInto(from[module], to[module], [module], changes);
  return changes;
}

/**
 * Merge this tab's list edit into the CURRENT list: this tab's items in its
 * order (its adds and in-place changes win for its own items), then every item
 * another writer added that this tab never saw, minus what this tab removed.
 */
function mergeKeyedList(current: unknown, base: unknown[], body: unknown[]): unknown[] {
  const removed = new Set(base.map(itemKey));
  for (const item of body) removed.delete(itemKey(item));
  const seen = new Set<ListKey | null>();
  const merged: unknown[] = [];
  for (const item of body) {
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  for (const item of Array.isArray(current) ? current : []) {
    const key = itemKey(item);
    if (key === null || seen.has(key) || removed.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function setAtPath(
  node: Record<string, unknown>,
  path: string[],
  update: (current: unknown) => unknown,
): Record<string, unknown> {
  const [head, ...rest] = path;
  const next: Record<string, unknown> = { ...node };
  if (rest.length === 0) {
    const value = update(node[head]);
    if (value === undefined) delete next[head];
    else next[head] = value;
    return next;
  }
  const child = isPlainObject(node[head]) ? (node[head] as Record<string, unknown>) : {};
  next[head] = setAtPath(child, rest, update);
  return next;
}

/** Apply changes onto the CURRENT record. Pure; never touches an unchanged key. */
export function applyPreferenceChanges(
  current: JsonObject,
  changes: readonly PreferenceChange[],
): JsonObject {
  let next: JsonObject = { ...current };
  for (const change of changes) {
    next = setAtPath(next, change.path, (existing) =>
      change.kind === "set" ? change.value : mergeKeyedList(existing, change.base, change.body),
    );
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
