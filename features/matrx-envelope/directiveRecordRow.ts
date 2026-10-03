"use client";

/**
 * THE RECORD A DIRECTIVE NAMES, AS IT IS NOW — one read:
 *
 *  - `readDirectiveRecord` is the package's `readRecord` seam
 *    (`@ai-matrx/content-ir-react` 0.16.0): an update card and its confirm say
 *    "Status open → done", never just "→ done" (reviewer, 2026-10-02).
 *  - whether a record a card names is in the trash NOW is answered for every
 *    door by `referenceTrash.ts` (`useReferenceDoor().trashed`).
 *
 * Data goes React → Supabase directly, under the reader's own row security —
 * the same table the catalog names for the noun (`CATALOG_NOUNS`, server
 * derived), the same read the reference-label resolver makes. A noun the
 * catalog does not carry, a non-uuid id, or a row the reader cannot see
 * answers `null`: honest absence, never a guess.
 */

import { isUuidShape } from "@ai-matrx/kit/uuid";
import { recordRevision, type DirectiveRecordRef } from "@ai-matrx/content-ir-react";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import {
  CATALOG_ALIASES,
  CATALOG_NOUNS,
} from "@/features/matrx-envelope/catalog-nouns.generated";

function tableFor(noun: string): { schema: string; table: string } | null {
  const entry = CATALOG_NOUNS[CATALOG_ALIASES[noun] ?? noun];
  if (!entry) return null;
  const dot = entry.table.indexOf(".");
  return dot === -1
    ? { schema: "public", table: entry.table }
    : { schema: entry.table.slice(0, dot), table: entry.table.slice(dot + 1) };
}

/**
 * Concurrent reads of one record share one request — within one REVISION of it
 * (`recordRevision`, bumped by every write this page makes). A read started
 * before a write is never handed to a reader asking after it (G7, 2026-10-02).
 *
 * A finished read is kept for `RECORD_READ_FRESH_MS` too (G10B review,
 * 2026-10-02): the card reads its record when it mounts and again when Apply is
 * hovered or focused, so the confirm that follows opens with the record already
 * in hand instead of waiting on a second round trip. A write on this page bumps
 * the revision, so a kept read is never handed out after this page changed it.
 */
const inFlight = new Map<string, Promise<Record<string, unknown> | null>>();
const settled = new Map<string, { at: number; value: Record<string, unknown> | null }>();
export const RECORD_READ_FRESH_MS = 15_000;

export function readDirectiveRecord(
  ref: DirectiveRecordRef,
): Promise<Record<string, unknown> | null> {
  const where = tableFor(ref.noun);
  if (!where || !isUuidShape(ref.id)) return Promise.resolve(null);
  const key = `${ref.noun}:${ref.id}#${recordRevision(ref.id)}`;
  const kept = settled.get(key);
  if (kept && Date.now() - kept.at < RECORD_READ_FRESH_MS) return Promise.resolve(kept.value);
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
      const value = (data as Record<string, unknown> | null) ?? null;
      settled.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

/**
 * When OTHER records of this type carry the same title — the `created_at` of
 * each (up to `limit`). Empty when none do, or when it cannot be read. A
 * confirm uses it to tell two same-named records apart (G10B review: "Delete
 * task Review5?" with two tasks named Review5).
 */
export async function readSameTitledCreatedAt(
  ref: DirectiveRecordRef,
  titleColumn: string,
  title: string,
  limit = 5,
): Promise<string[]> {
  const where = tableFor(ref.noun);
  if (!where || !isUuidShape(ref.id) || !title.trim()) return [];
  const db: SupabaseClient = supabase;
  const from =
    where.schema === "public" ? db.from(where.table) : db.schema(where.schema).from(where.table);
  const { data, error } = await from
    .select(`id, created_at`)
    .eq(titleColumn, title)
    .neq("id", ref.id)
    .limit(limit);
  if (error) {
    console.warn(
      `[directiveRecordRow] Could not check for other ${ref.noun} records named the same ` +
        `(${where.schema}.${where.table}.${titleColumn}: ${error.message}). The confirm names the record without a date.`,
    );
    return [];
  }
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => row.created_at)
    .filter((at): at is string => typeof at === "string" && at.length > 0);
}
