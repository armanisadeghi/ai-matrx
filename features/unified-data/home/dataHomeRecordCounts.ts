// features/unified-data/home/dataHomeRecordCounts.ts — LANE DATA-HOME-3D
//
// THE RECORDS COLUMN, FILLED LAZILY. `custom.data_home` carries no count (counting every Table is
// 5-10 s). A Records cell that is on screen asks `want(...)`; asks made within `debounceMs` of each
// other go out together, one `custom.table_row_counts` call per organization (500 Tables at most a
// call). The list never waits: a cell shows `—` until its count arrives, and a Table the door does
// not answer (or a refused call) stays `—`, never 0. A count is asked once per Table per tab;
// a refused call is asked again the next time the row scrolls into view.

import * as doors from "@/features/unified-data/hub/doors";

export const RECORD_COUNT_DEBOUNCE_MS = 120;

/**
 * Tables counted per call. The door counts every table's visible rows inside ONE statement, so an
 * organization with hundreds of big tables hit the statement timeout at 500 (359 tables, 2026-10-09)
 * and every cell stayed `—`. Small calls, one after another per organization, stay under it.
 */
export const RECORD_COUNT_CHUNK = 25;

export interface RecordCountStore {
  /** The count, or undefined while it is not known. */
  get: (tableId: string) => number | undefined;
  /** A row on screen wants its count. */
  want: (organizationId: string, tableId: string) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createRecordCountStore(
  ask: (organizationId: string, tableIds: string[]) => Promise<doors.DoorAnswer<doors.TableRowCount[]>>,
  debounceMs: number = RECORD_COUNT_DEBOUNCE_MS,
): RecordCountStore {
  const counts = new Map<string, number>();
  const inFlight = new Set<string>();
  const pending = new Map<string, Set<string>>();
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const notify = () => {
    listeners.forEach((l) => l());
  };

  const flush = () => {
    timer = null;
    const batches = [...pending.entries()];
    pending.clear();
    for (const [organizationId, idSet] of batches) {
      const ids = [...idSet];
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += RECORD_COUNT_CHUNK) chunks.push(ids.slice(i, i + RECORD_COUNT_CHUNK));
      // One organization's chunks go one after another (a burst of heavy counts is what timed out);
      // organizations go side by side.
      // The first chunk goes out in this tick (nothing waits on a promise to start); the rest follow
      // one after another as each answer lands.
      const run = (i: number): void => {
        const chunk = chunks[i];
        if (!chunk) return;
        ask(organizationId, chunk)
          .then(
            (answer) => {
              if (answer.ok) {
                for (const row of answer.data) counts.set(row.table_id, Number(row.visible_rows));
              }
            },
            () => undefined,
          )
          .then(() => {
            chunk.forEach((id) => inFlight.delete(id));
            notify();
            run(i + 1);
          });
      };
      run(0);
    }
  };

  return {
    get: (tableId) => counts.get(tableId),
    want: (organizationId, tableId) => {
      if (counts.has(tableId) || inFlight.has(tableId)) return;
      inFlight.add(tableId);
      let set = pending.get(organizationId);
      if (!set) pending.set(organizationId, (set = new Set()));
      set.add(tableId);
      if (!timer) timer = setTimeout(flush, debounceMs);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
