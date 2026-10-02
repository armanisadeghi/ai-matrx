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
import type { DirectiveRecordRef } from "@ai-matrx/content-ir-react";

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
