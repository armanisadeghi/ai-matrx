// features/unified-data/home/dataHomeTablesSource.ts — LANE DATA-HOME-3C
//
// THE ⌘K BAR'S TABLES SECTION, FED BY THE DATA HOME'S ONE DOOR (DATA-HOME-3-SPEC §5 Lane C). Every
// table, form, dashboard … the person may open, in every organization she reaches —
// `custom.data_home`, built into rows by the home's own builder (dataHomeRows.ts), so a hit's
// address, kind word and organization are exactly the row the data home lists. Never filtered by
// the active organization (common-docs/policies/access-ladder.md): the bar
// names each hit's organization instead.
//
// CACHED FOR THE TAB: one read per person, kept for DATA_HOME_TABLES_FRESH_MS; an older answer is
// still offered at once while a fresh read runs behind it (stale-while-revalidate). A failed read is
// never cached as an empty list — the next opening asks again — and the bar shows the store's words.
// Ranking is the home's own instant search (`scoreRow`), so `harbr` finds Harbor in both places.

import { createRecordsClient, supabaseDataSource } from "@ai-matrx/records/core";

import { createClient } from "@/utils/supabase/client";
import * as doors from "@/features/unified-data/hub/doors";
import { buildDataHomeRows, type DataHomeRow } from "./dataHomeRows";
import { scoreRow } from "./dataHomeSearch";

export const DATA_HOME_TABLES_FRESH_MS = 60_000;

interface Held {
  userId: string | null;
  at: number;
  rows: Promise<DataHomeRow[]>;
  settled: DataHomeRow[] | null;
}
let held: Held | null = null;

async function readAll(userId: string | null): Promise<DataHomeRow[]> {
  const dataSource = supabaseDataSource(createClient());
  // SEARCH FINDS EVERYTHING SHE CAN OPEN (lane DATA-HOME-SLIM, 2026-10-08): the door now leaves
  // platform tables (a choice column's List above all) out unless asked, for the data home's default
  // view. The bar is a search, not that view, so it asks with them in.
  const answered = await doors.dataHome(dataSource, null, { includePlatformTables: true });
  if (!answered.ok) {
    throw new Error(`Could not read tables. ${doors.doorFailureLine(answered.error)}`, { cause: answered.error });
  }
  const client = createRecordsClient({
    dataSource,
    actor: userId ? { actor: "user", user_id: userId } : { actor: "user" },
    organizationId: null,
  });
  const built = await buildDataHomeRows({ client, dataSource, answer: answered.data });
  return built.rows;
}

/**
 * The rows for the bar: `{ now }` = what is already held (null before the first answer), `{ next }`
 * = the read that settles it (the held one when still fresh). `read` is the test seam.
 */
export function dataHomeTables(
  userId: string | null,
  opts: { now?: number; read?: (userId: string | null) => Promise<DataHomeRow[]> } = {},
): { now: DataHomeRow[] | null; next: Promise<DataHomeRow[]> } {
  const now = opts.now ?? Date.now();
  const read = opts.read ?? readAll;
  if (held && held.userId === userId && now - held.at < DATA_HOME_TABLES_FRESH_MS) {
    return { now: held.settled, next: held.rows };
  }
  const previous = held && held.userId === userId ? held.settled : null;
  const entry: Held = { userId, at: now, rows: Promise.resolve([]), settled: previous };
  entry.rows = read(userId).then(
    (rows) => {
      entry.settled = rows;
      return rows;
    },
    (error: unknown) => {
      if (held === entry) held = null; // never cached as empty
      throw error;
    },
  );
  held = entry;
  return { now: previous, next: entry.rows };
}

/** Forget the held answer (tests; a sign-out). */
export function forgetDataHomeTables(): void {
  held = null;
}

/** The hits for `text`, best first (ties: the newest). Empty text → none (the bar shows recents). */
export function rankDataHomeTables(rows: readonly DataHomeRow[], text: string): DataHomeRow[] {
  if (!text.trim()) return [];
  const scored: Array<{ row: DataHomeRow; score: number }> = [];
  for (const row of rows) {
    const score = scoreRow(row, text);
    if (score !== null) scored.push({ row, score });
  }
  scored.sort((a, b) => b.score - a.score || (b.row.updatedAt ?? "").localeCompare(a.row.updatedAt ?? ""));
  return scored.map((s) => s.row);
}

// The bar's row words and icon, from the home's own files (they travel with this dynamic chunk).
export { dataHomeKindWord } from "./dataHomeRows";
export { KindIcon } from "./dataHomeColumns";
