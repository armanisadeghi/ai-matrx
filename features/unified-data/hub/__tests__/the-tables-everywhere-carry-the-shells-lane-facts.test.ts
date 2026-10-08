// features/unified-data/hub/__tests__/the-tables-everywhere-carry-the-shells-lane-facts.test.ts
//
// LANE DATA-HOME-2 (2026-09-30): the agent builder's "From my data" picker reads the data home's
// table list (useTablesEverywhere); the shell's lanes need each row's maker and team fact.
// RED before: rows carried no team / system / maker, and no lane helper existed.
import * as everywhere from "../useTablesEverywhere";
import type { DataHomeTableRow } from "../doors";

const ROW = (over: Partial<DataHomeTableRow>): DataHomeTableRow => ({
  table_id: "a1000000-0000-4000-8000-000000000001",
  table_name: "Service calls",
  organization_id: "884d1ce8-0000-4000-8000-000000000002",
  organization_name: "Rincon Plumbing Co",
  member: true,
  visibility: "internal",
  updated_at: "2026-09-27T15:40:00Z",
  mine: false,
  shared_with_me: false,
  platform_owned: false,
  kind: "table",
  ...over,
});

it("a table a teammate made is in My team and All; a system starter only in System", () => {
  const inLane = (everywhere as { inLane?: typeof everywhere.inLane }).inLane;
  if (!inLane) throw new Error("useTablesEverywhere offers no lane helper");
  const teammate = ROW({ team: true, created_by: "5a1e0000-0000-4000-8000-00000000c0de" });
  const starter = ROW({ table_id: "b2", member: false, system: true });
  expect(inLane([teammate, starter], "team")).toEqual([teammate]);
  expect(inLane([teammate, starter], "all")).toEqual([teammate]);
  expect(inLane([teammate, starter], "system")).toEqual([starter]);
  expect(everywhere.laneFactsOf(teammate).createdBy).toBe("5a1e0000-0000-4000-8000-00000000c0de");
});

// LANE DATA-HOME-3D: the door names each Table's maker; a row may carry the name or null.
it("a row carries the maker's name from the door, or null when the maker left", () => {
  const named: DataHomeTableRow = ROW({ team: true, created_by: "5a1e0000-0000-4000-8000-00000000c0de", created_by_name: "Dana Reyes" });
  const gone: DataHomeTableRow = ROW({ created_by_name: null });
  expect(named.created_by_name).toBe("Dana Reyes");
  expect(gone.created_by_name).toBeNull();
});
