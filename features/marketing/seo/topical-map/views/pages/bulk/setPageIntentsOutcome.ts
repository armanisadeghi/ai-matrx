// features/marketing/seo/topical-map/views/pages/bulk/setPageIntentsOutcome.ts
//
// WHAT `seo.set_page_intents` ACTUALLY ANSWERS, narrowed once, here.
//
// The frozen client type (`../../../types.ts` → `SetPageIntentsResult`) predates
// migration 23 (aidream `0805_a_map_edge_names_the_person_who_wrote_it.sql`,
// the `jsonb_build_object` at lines 66–238). Since that migration the function
// answers with THREE row shapes and a fourth scalar the frozen type has no key
// for:
//
//   { ok:true,  page_id, url? }                                   — SET
//   { ok:true,  page_id, url?, kept_existing:{ source, state } }  — KEPT
//   { ok:false, page_id?, url?, error }                           — FAILED
//   …and a top-level `kept` beside `set` / `failed`.
//
// KEPT IS THE ROW THIS FILE EXISTS FOR. A page whose intent a HIGHER source
// already holds (human > agent > mapper), or whose intent is already
// `accepted`/`done`, is LEFT ALONE — the write did not happen and nothing went
// wrong. Counting it as a success lies about what is in the database; counting
// it as a failure invites somebody to retry a decision a person already made.
// It is its own answer and every caller shows it as one.
//
// `types.ts` is coordinator-owned (CONTRACTS §9), so the type change is FILED
// rather than made here, and everything below narrows the raw result
// STRUCTURALLY — it never trusts the frozen type's shape.

import type { SetPageIntentsResult } from "../../../types";
import type { SetPageIntentsKeptRow, SetPageIntentsOutcome } from "../seams";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * A finite number under `key`, or null when the result does not carry one.
 * Null is the honest answer for a server that predates the key — not 0, which
 * would read as "nothing was kept" when the truth is "nobody said".
 */
function readCount(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The KEPT row, recognised by its own shape rather than by a type assertion —
 * `kept_existing` is the only thing that tells a kept row from a set one, and
 * both carry `ok: true`.
 */
export function isSetPageIntentsKeptRow(row: unknown): row is SetPageIntentsKeptRow {
  if (!isRecord(row) || row.ok !== true) return false;
  if (!("kept_existing" in row)) return false;
  // `typeof null === "object"`, so the null check is load-bearing.
  return isRecord(row.kept_existing);
}

/** What held a kept page, said in words. Both halves come from the server. */
export function keptExistingSentence(row: SetPageIntentsKeptRow): string {
  const kept: Record<string, unknown> = isRecord(row.kept_existing)
    ? (row.kept_existing as Record<string, unknown>)
    : {};
  const source = readString(kept, "source") ?? "another writer";
  const state = readString(kept, "state") ?? "an existing decision";
  return `held by ${source} as ${state}`;
}

/**
 * Narrows one `seo.set_page_intents` result — a real one or a `map_dry_run`'s
 * `would_return` — into the three answers a screen has to tell apart.
 *
 * Nothing is dropped. A row this function cannot read is reported as a failure
 * carrying a sentence saying so, because a silently skipped row is a page whose
 * fate nobody can see.
 */
export function toSetPageIntentsOutcome(result: SetPageIntentsResult): SetPageIntentsOutcome {
  const raw: Record<string, unknown> = isRecord(result) ? result : {};
  const rows: unknown[] = Array.isArray(raw.results) ? (raw.results as unknown[]) : [];

  const setPageIds: string[] = [];
  const keptRows: SetPageIntentsKeptRow[] = [];
  const failedRows: SetPageIntentsOutcome["failedRows"] = [];
  let setRowCount = 0;

  for (const row of rows) {
    if (!isRecord(row)) {
      failedRows.push({
        error: `seo.set_page_intents returned a result row that is not an object (${JSON.stringify(row)}). It is counted as a failure rather than dropped.`,
      });
      continue;
    }
    if (row.ok === false) {
      failedRows.push({
        page_id: readString(row, "page_id"),
        url: readString(row, "url"),
        // SQLERRM, verbatim. The function writes its refusals for the person
        // making the change; rewording one destroys the only explanation they
        // will ever get.
        error:
          readString(row, "error") ??
          "seo.set_page_intents refused this page and returned no message.",
      });
      continue;
    }
    if (isSetPageIntentsKeptRow(row)) {
      keptRows.push(row);
      continue;
    }
    setRowCount += 1;
    const pageId = readString(row, "page_id");
    if (pageId) setPageIds.push(pageId);
  }

  // The SERVER'S OWN counts win when it sent them — it is the writer, and it
  // counted what it did. The row-derived numbers are the fallback for `kept`,
  // which no `SetPageIntentsResult` older than migration 23 carries at all, and
  // for `set`/`failed` if a caller ever hands this function a partial document.
  return {
    result,
    set: readCount(raw, "set") ?? setRowCount,
    kept: readCount(raw, "kept") ?? keptRows.length,
    failed: readCount(raw, "failed") ?? failedRows.length,
    setPageIds,
    keptRows,
    failedRows,
  };
}

/**
 * One outcome over several per-site calls.
 *
 * `seo.set_page_intents` is per SITE, so a selection spanning two sites is two
 * calls and two results. The person made ONE decision, so they are shown one
 * answer — but every row is carried through, never summarised away.
 *
 * `map_id` is the first result's: every site in a selection reaches this screen
 * through the same map, and a synthesised blank would be a fact nobody stated.
 */
export function mergeSetPageIntentsOutcomes(
  outcomes: readonly SetPageIntentsOutcome[],
): SetPageIntentsOutcome {
  const results = outcomes.flatMap((outcome) =>
    Array.isArray(outcome.result?.results) ? outcome.result.results : [],
  );
  const set = outcomes.reduce((total, outcome) => total + outcome.set, 0);
  const kept = outcomes.reduce((total, outcome) => total + outcome.kept, 0);
  const failed = outcomes.reduce((total, outcome) => total + outcome.failed, 0);
  return {
    result: {
      ok: failed === 0,
      map_id: outcomes[0]?.result?.map_id ?? "",
      set,
      failed,
      results,
    },
    set,
    kept,
    failed,
    setPageIds: outcomes.flatMap((outcome) => outcome.setPageIds),
    keptRows: outcomes.flatMap((outcome) => outcome.keptRows),
    failedRows: outcomes.flatMap((outcome) => outcome.failedRows),
  };
}

/**
 * The one line every write answers with. Kept is named, never folded into
 * either of its neighbours.
 */
export function setPageIntentsOutcomeLine(outcome: SetPageIntentsOutcome): string {
  return `Set ${outcome.set} · Kept ${outcome.kept} (a person already decided this page) · Failed ${outcome.failed}`;
}
