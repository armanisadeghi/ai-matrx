// lib/supabase/readAllRowsIn.ts — READ EVERY ROW WHOSE COLUMN IS IN A LIST OF IDS, HOWEVER LONG.
//
// Two silent failures of one `.in(<column>, ids)` over a list that grows (lane HANDOVER, 2026-09-27):
//   1. THE ADDRESS. PostgREST reads are GETs, so every id rides the URL. 600 scope ids made an
//      address the gateway refused before PostgREST saw it; the browser reported it as a CORS error
//      and /scopes drew its tables with no values.
//   2. THE ROW CAP. One response is capped at 1000 rows (`readAllRows` exists for that), so a long
//      list lost rows even when the address fit.
// This asks in batches of `batchSize` ids (100 keeps the address far under any limit) and reads each
// batch to its declared total with `readAllRows`, which throws rather than return a short list.
//
// The query factory must request `{ count: "exact" }` and a stable `.order(...)` — readAllRows'
// contract — and apply `.in(<column>, batch)` and `.range(from, to)` to what it builds.

import { readAllRows, type PagedReadQuery } from "@ai-matrx/data/db";

export async function readAllRowsIn<T>(
  ids: readonly string[],
  query: (batch: string[]) => PagedReadQuery<T>,
  { label, batchSize = 100 }: { label: string; batchSize?: number },
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += batchSize) batches.push(unique.slice(i, i + batchSize));
  const pages = await Promise.all(batches.map((batch) => readAllRows(query(batch), { label })));
  return pages.flat();
}
