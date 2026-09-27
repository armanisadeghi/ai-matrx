/**
 * LANE PROOF-DEFECTS (D6) — AN AUTOMATION ON AN ARCHIVED TABLE SAYS SO.
 *
 * THE USE CASE. Harbor Dental's front desk set "when Reminder sent changes, run the follow-up
 * agent" on its recall table. When that table is archived on the side the automation listens to
 * (the older table after the switch, or the copy archived in the new system), no event ever
 * arrives again. The schedules page must say which ones, instead of a green toggle that never runs.
 * RED before triggerWatch existed (the import fails).
 */
import { liveTableKeys, watchedTable, watchesAnArchivedTable } from "../triggerWatch";

const TABLE = "b00bde4d-1adc-4682-88eb-57453aabf014";
const older = { type: "event" as const, config: { entity_type: "user_table_row", table_id: TABLE, actions: ["row.updated"] } };
const store = { type: "event" as const, config: { entity_type: `custom_record:${TABLE}`, table_id: TABLE, actions: ["record.updated"] } };

test("the watched table and its store are read from both config shapes", () => {
  expect(watchedTable(older)).toEqual({ tableId: TABLE, store: "older" });
  expect(watchedTable(store)).toEqual({ tableId: TABLE, store: "records" });
  expect(watchedTable({ type: "event", config: { entity_type: `record:${TABLE}` } })).toEqual({ tableId: TABLE, store: "records" });
  expect(watchedTable({ type: "cron", config: {} })).toBeNull();
  expect(watchedTable({ type: "event", config: { entity_type: "user_table_row" } })).toBeNull();
});

test("an automation on the older side of a switched table watches an archived table", () => {
  const live = liveTableKeys([{ id: TABLE, store: "records" }]); // only the copy is live
  expect(watchesAnArchivedTable(older, live)).toBe(true);
  expect(watchesAnArchivedTable(store, live)).toBe(false);
});

test("an automation whose table is live on its side is not flagged", () => {
  const live = liveTableKeys([{ id: TABLE, store: "older" }, { id: TABLE, store: "records" }]);
  expect(watchesAnArchivedTable(older, live)).toBe(false);
  expect(watchesAnArchivedTable(store, live)).toBe(false);
});
