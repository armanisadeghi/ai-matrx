// features/scheduling/lib/triggerWatch.ts
//
// WHICH TABLE A "WHEN A ROW CHANGES" AUTOMATION WATCHES, AND WHETHER IT IS STILL THERE (lane
// PROOF-DEFECTS, D6). An event trigger names its table two ways: the older store's rows
// (`entity_type: "user_table_row"`, events `row.*`) or the record store's (`custom_record:<id>` /
// `record:<id>`, events `record.*`). A table archived on the side the trigger listens to sends no
// more events, so the automation can never fire — and until this nothing said so. The schedules
// page and the schedule's trigger card draw a red line for exactly those.

import type { AgendaTrigger } from "../types";

export type TableStore = "older" | "records";

export interface WatchedTable {
  tableId: string;
  store: TableStore;
}

/** The table an event trigger watches, or null (not an event trigger, or "any table"). */
export function watchedTable(trigger: Pick<AgendaTrigger, "type" | "config">): WatchedTable | null {
  if (trigger.type !== "event") return null;
  const cfg = trigger.config ?? {};
  const entity = typeof cfg.entity_type === "string" ? cfg.entity_type : "";
  const named = typeof cfg.table_id === "string" && cfg.table_id.trim() ? cfg.table_id.trim() : null;
  if (entity === "user_table_row") return named ? { tableId: named, store: "older" } : null;
  const m = /^(?:custom_record|record):(.+)$/.exec(entity);
  if (m?.[1]) return { tableId: named ?? m[1], store: "records" };
  return null;
}

/** `store:id` for every table the organization still has live (custom.table_list_everywhere). */
export function liveTableKeys(tables: ReadonlyArray<{ id?: unknown; store?: unknown }>): Set<string> {
  const out = new Set<string>();
  for (const t of tables) {
    if (typeof t.id === "string" && (t.store === "older" || t.store === "records")) out.add(`${t.store}:${t.id}`);
  }
  return out;
}

/** True when the trigger listens to a table that is archived (or gone) on the side it listens to. */
export function watchesAnArchivedTable(
  trigger: Pick<AgendaTrigger, "type" | "config">,
  live: ReadonlySet<string>,
): boolean {
  const w = watchedTable(trigger);
  return w !== null && !live.has(`${w.store}:${w.tableId}`);
}

export const WATCHES_AN_ARCHIVED_TABLE = "Watches an archived table; re-key or disable.";
