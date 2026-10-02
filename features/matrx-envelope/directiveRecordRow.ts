"use client";

/**
 * THE RECORD A DIRECTIVE NAMES, AS IT IS NOW — one read, two answers:
 *
 *  - `readDirectiveRecord` is the package's `readRecord` seam
 *    (`@ai-matrx/content-ir-react` 0.16.0): an update card and its confirm say
 *    "Status open → done", never just "→ done" (reviewer, 2026-10-02).
 *  - `useDirectiveRecordTrashed` answers whether a record a card names is in
 *    the trash NOW, so a Create card whose record was deleted afterwards says so
 *    (reviewer, 2026-10-02) instead of offering a live-looking door.
 *
 * Data goes React → Supabase directly, under the reader's own row security —
 * the same table the catalog names for the noun (`CATALOG_NOUNS`, server
 * derived), the same read the reference-label resolver makes. A noun the
 * catalog does not carry, a non-uuid id, or a row the reader cannot see
 * answers `null`: honest absence, never a guess.
 */

import { useEffect, useState } from "react";
import { isUuidShape } from "@ai-matrx/kit/uuid";
import type { DirectiveRecordRef } from "@ai-matrx/content-ir-react";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import {
  CATALOG_ALIASES,
  CATALOG_NOUNS,
} from "@/features/matrx-envelope/catalog-nouns.generated";
import { useReferenceRecordVersion } from "@/features/matrx-envelope/referenceResolvers";

function tableFor(noun: string): { schema: string; table: string } | null {
  const entry = CATALOG_NOUNS[CATALOG_ALIASES[noun] ?? noun];
  if (!entry) return null;
  const dot = entry.table.indexOf(".");
  return dot === -1
    ? { schema: "public", table: entry.table }
    : { schema: entry.table.slice(0, dot), table: entry.table.slice(dot + 1) };
}

/** Concurrent reads of one record share one request. */
const inFlight = new Map<string, Promise<Record<string, unknown> | null>>();

export function readDirectiveRecord(
  ref: DirectiveRecordRef,
): Promise<Record<string, unknown> | null> {
  const where = tableFor(ref.noun);
  if (!where || !isUuidShape(ref.id)) return Promise.resolve(null);
  const key = `${ref.noun}:${ref.id}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  // The table comes from the catalog at run time, so the read goes through the
  // untyped client view — exactly as the catalog-derived reference resolver does.
  const db: SupabaseClient = supabase;
  const from =
    where.schema === "public" ? db.from(where.table) : db.schema(where.schema).from(where.table);
  const started = Promise.resolve(
    from.select("*").eq("id", ref.id).maybeSingle(),
  )
    .then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return (data as Record<string, unknown> | null) ?? null;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

/** True when a soft-deleted row says so — `deleted_at` set or `is_deleted`. */
export function isTrashedRow(row: Record<string, unknown> | null): boolean {
  if (!row) return false;
  if (row.deleted_at !== null && row.deleted_at !== undefined && row.deleted_at !== "") return true;
  return row.is_deleted === true;
}

/**
 * Is `{noun, id}` in the trash right now? Re-read whenever a writer on this page
 * changes the record (`invalidateReferenceLabel`) — a Delete card applied in
 * the same note flips the Create card's door to "(in trash)" without a reload.
 * `null` while unknown.
 */
export function useDirectiveRecordTrashed(noun: string, id: string): boolean | null {
  const version = useReferenceRecordVersion(id);
  const key = `${noun}:${id}:${version}`;
  const [answer, setAnswer] = useState<{ key: string; trashed: boolean | null }>({
    key: "",
    trashed: null,
  });
  useEffect(() => {
    let live = true;
    readDirectiveRecord({ noun, id })
      .then((row) => {
        if (live) setAnswer({ key, trashed: row ? isTrashedRow(row) : null });
      })
      .catch(() => {
        if (live) setAnswer({ key, trashed: null });
      });
    return () => {
      live = false;
    };
  }, [key, noun, id]);
  // A re-read of the same record keeps the last answer until the new one lands.
  return answer.key.startsWith(`${noun}:${id}:`) ? answer.trashed : null;
}
