"use client";

/**
 * IS THE RECORD A REFERENCE NAMES IN THE TRASH? — one answer for every chip,
 * directive row and tally that names a record (G6A review, 2026-10-02).
 *
 * THE DEFECT. A chip pointing at a trashed task showed its plain name, and its
 * click opened the in-place window, whose live read filters trashed rows and
 * answered "We couldn't open this task…" with nowhere to go. The record is not
 * gone: row security lets its reader see a trashed row (authed RLS never gates
 * `deleted_at`), so the chip's label resolved as if nothing had happened.
 *
 * The read is the record the DOOR opens — the resolver's `opensTable` and
 * `openId`, the same pair `referenceDoor` derives the door from — so every noun
 * with a door gets the answer, bespoke resolver or catalog-derived. Only
 * `deleted_at` is read (Trash and its one restore door, `entity_undelete`, work
 * on that column). A table without it, a non-uuid id, or a read that fails
 * answers `null`: unknown, never a guess. The answer is re-read whenever a
 * writer on this page changes the record (`invalidateReferenceLabel`).
 */

import { useEffect, useState } from "react";
import { isUuidShape } from "@ai-matrx/kit/uuid";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import {
  getReferenceResolver,
  useReferenceRecordVersion,
} from "@/features/matrx-envelope/referenceResolvers";

/** True when a soft-deleted row says so — `deleted_at` set or `is_deleted`. */
export function isTrashedRow(row: Record<string, unknown> | null): boolean {
  if (!row) return false;
  if (row.deleted_at !== null && row.deleted_at !== undefined && row.deleted_at !== "") return true;
  return row.is_deleted === true;
}

/** The record `(type, ref)`'s door opens: its table and id, or null. */
export function referenceRecordTarget(
  type: string,
  ref: Record<string, string>,
): { schema: string; table: string; id: string } | null {
  const resolver = getReferenceResolver(type);
  const qualified = resolver?.opensTable;
  const id = resolver?.openId(ref);
  if (!qualified || !id || !isUuidShape(id)) return null;
  const dot = qualified.indexOf(".");
  return dot === -1
    ? { schema: "public", table: qualified, id }
    : { schema: qualified.slice(0, dot), table: qualified.slice(dot + 1), id };
}

/** Concurrent reads of one record share one request. */
const inFlight = new Map<string, Promise<boolean | null>>();

type RecordTarget = { schema: string; table: string; id: string };

/** Is this record in the trash now? `null` = could not tell. */
export function readRecordTrashed(target: RecordTarget): Promise<boolean | null> {
  const key = `${target.schema}.${target.table}:${target.id}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  // The table comes from the resolver at run time, so the read goes through the
  // untyped client view — exactly as the catalog-derived reference resolver does.
  const db: SupabaseClient = supabase;
  const from =
    target.schema === "public" ? db.from(target.table) : db.schema(target.schema).from(target.table);
  const started = Promise.resolve(from.select("deleted_at").eq("id", target.id).maybeSingle())
    .then(({ data, error }) => {
      if (error || !data) return null;
      return isTrashedRow(data as Record<string, unknown>);
    })
    .catch(() => null)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

/** The hook: `true` in the trash, `false` live, `null` unknown or still reading. */
export function useReferenceTrashed(type: string, ref: Record<string, string>): boolean | null {
  const target = referenceRecordTarget(type, ref);
  const version = useReferenceRecordVersion(target?.id ?? "");
  const recordKey = target ? `${target.schema}|${target.table}|${target.id}` : "";
  const key = recordKey ? `${recordKey}|${version}` : "";
  const [answer, setAnswer] = useState<{ key: string; trashed: boolean | null }>({
    key: "",
    trashed: null,
  });
  useEffect(() => {
    if (!key) return undefined;
    const [schema = "", table = "", id = ""] = key.split("|");
    let live = true;
    readRecordTrashed({ schema, table, id }).then((trashed) => {
      if (live) setAnswer({ key, trashed });
    });
    return () => {
      live = false;
    };
  }, [key]);
  if (!key) return null;
  // A re-read of the same record keeps the last answer until the new one lands.
  return answer.key.startsWith(`${recordKey}|`) ? answer.trashed : null;
}
