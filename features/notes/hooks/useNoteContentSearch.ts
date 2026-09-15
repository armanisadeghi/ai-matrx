"use client";

// useNoteContentSearch — the BODY half of searching notes.
//
// The list no longer carries note bodies (audit N-24: every route entry
// downloaded the full text of every note), so a search box that matched on
// `content` locally would silently stop finding text. Titles, tags and ids
// still match locally and instantly; for the body, a query of three or more
// characters asks the database — debounced, latest-wins, one request in
// flight — and hands back the ids that match. Both the desktop sidebar and
// the phone list merge those ids into their local filter.

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

export const CONTENT_SEARCH_MIN_CHARS = 3;
export const CONTENT_SEARCH_DEBOUNCE_MS = 250;
/** More matches than this and the query is too broad to be useful as a list;
 *  the user narrows it. Stated, never silent. */
export const CONTENT_SEARCH_MAX_ROWS = 500;

const EMPTY: ReadonlySet<string> = new Set();

/** `%` and `_` are wildcards in ILIKE; a typed one must match itself. */
export function escapeIlike(query: string): string {
  return query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export interface NoteContentSearch {
  /** Ids whose BODY matches the query. Empty until the query is long enough. */
  ids: ReadonlySet<string>;
  /** True while a request is in flight. */
  searching: boolean;
  /** True when the database capped the result — narrow the query. */
  capped: boolean;
}

interface BodySearchResult {
  /** The query these ids answer. `searching` is derived by comparing it to
   *  the live query — no state write is needed to say "in flight". */
  query: string;
  ids: ReadonlySet<string>;
  capped: boolean;
}

const NO_RESULT: BodySearchResult = { query: "", ids: EMPTY, capped: false };

export function useNoteContentSearch(query: string): NoteContentSearch {
  const trimmed = query.trim();
  const active = trimmed.length >= CONTENT_SEARCH_MIN_CHARS;
  const [result, setResult] = useState<BodySearchResult>(NO_RESULT);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const { data, error } = await supabase
          .schema("workbench")
          .from("notes")
          .select("id")
          .is("deleted_at", null)
          .ilike("content", `%${escapeIlike(trimmed)}%`)
          .limit(CONTENT_SEARCH_MAX_ROWS);
        if (cancelled) return;
        if (error) {
          captureError({
            source: "supabase-postgrest",
            operation: "select",
            schema: "workbench",
            relation: "notes",
            message: `note body search failed: ${error.message}`,
            raw: error,
          });
          setResult({ query: trimmed, ids: EMPTY, capped: false });
          return;
        }
        const rows = data ?? [];
        setResult({
          query: trimmed,
          ids: new Set(rows.map((row) => row.id)),
          capped: rows.length >= CONTENT_SEARCH_MAX_ROWS,
        });
      })();
    }, CONTENT_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, trimmed]);

  if (!active) return { ids: EMPTY, searching: false, capped: false };
  const current = result.query === trimmed;
  return {
    ids: current ? result.ids : EMPTY,
    searching: !current,
    capped: current && result.capped,
  };
}
