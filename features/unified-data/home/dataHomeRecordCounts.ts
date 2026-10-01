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
      for (let i = 0; i < ids.length; i += doors.TABLE_ROW_COUNTS_MAX) {
        const chunk = ids.slice(i, i + doors.TABLE_ROW_COUNTS_MAX);
        void ask(organizationId, chunk)
          .then((answer) => {
            if (answer.ok) {
              for (const row of answer.data) counts.set(row.table_id, Number(row.visible_rows));
            }
          })
          .catch(() => undefined)
          .finally(() => {
            chunk.forEach((id) => inFlight.delete(id));
            notify();
          });
      }
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
