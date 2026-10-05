/**
 * THE LEAST IMPORTANT COLUMN LEAVES FIRST (DATA-HOME-3E; VERIFY V3: at 1024 px Owner and Access sat
 * off the right edge of /data). Pure rule over declared widths.
 */
import { columnsWithoutRoom, ROW_ACTIONS_WIDTH } from "../columnPriority";
import type { EntityColumnSpec } from "../columns";

type R = { id: string };
const col = (id: string, width: number, priority?: number, locked = false) =>
  ({ id, label: id, locked, ...(priority !== undefined ? { priority } : {}), column: { id, width } }) as EntityColumnSpec<R>;
// The data home's own ranking: Kind leaves first, then Records; Owner and Access stay longest.
const HOME = [
  col("favorite", 40, undefined, true),
  col("name", 320, undefined, true),
  col("kind", 120, 4),
  col("organization", 180, 2),
  col("records", 90, 3),
  col("updated", 110, 2),
  col("owner", 100, 1),
  col("access", 90, 1),
];
const total = HOME.reduce((s, c) => s + (c.column.width as number), 0) + ROW_ACTIONS_WIDTH;

it("keeps every column when they fit", () => {
  expect(columnsWithoutRoom(HOME, [], total)).toEqual([]);
});
it("drops the highest number first, only as many as needed", () => {
  expect(columnsWithoutRoom(HOME, [], total - 10)).toEqual(["kind"]);
  expect(columnsWithoutRoom(HOME, [], 944)).toEqual(["kind", "records"]);
});
it("never drops an unranked or locked column, and ignores what the person hid", () => {
  expect(columnsWithoutRoom(HOME, ["kind"], 944)).toEqual(["records"]);
  expect(columnsWithoutRoom(HOME, [], 300)).not.toContain("name");
});
it("drops nothing before the width is known (or on a phone)", () => {
  expect(columnsWithoutRoom(HOME, [], null)).toEqual([]);
});
