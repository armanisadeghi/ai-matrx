/**
 * @jest-environment jsdom
 *
 * FIRST PAINT = SETTLED PAINT (HOME-COLUMNS, 2026-10-07; /data home measured CLS 0.0911). The server
 * paints every column; the script that follows the table must already hide the columns the React
 * rule would drop once it measures — same rule, same answer, before hydration.
 */
import { columnsWithoutRoom, noRoomScript, NO_ROOM_ATTR, NO_ROOM_CSS, clearNoRoomMarks, ROW_ACTIONS_WIDTH } from "../columnPriority";
import type { EntityColumnSpec } from "../columns";

type R = { id: string };
const col = (id: string, width: number, priority?: number, locked = false) =>
  ({ id, label: id, locked, ...(priority !== undefined ? { priority } : {}), column: { id, width } }) as EntityColumnSpec<R>;
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

/** The server's HTML for the list body: header + one skeleton row + the script, run as the parser would. */
function paint(available: number, specs = HOME, shown = specs.map((s) => s.id)): string[] {
  document.body.innerHTML = `<div id="b"><table><thead><tr>${shown
    .map((id) => `<th data-matrx-table-column-id="${id}">${id}</th>`)
    .join("")}<th>Actions</th></tr></thead><tbody><tr>${shown.map(() => "<td></td>").join("")}<td></td></tr></tbody></table></div>`;
  const body = document.getElementById("b")!;
  Object.defineProperty(body, "clientWidth", { value: available });
  Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
  const script = document.createElement("script");
  body.appendChild(script);
  Object.defineProperty(document, "currentScript", { value: script, configurable: true });
  document.documentElement.removeAttribute(NO_ROOM_ATTR);
  tableHtmlBefore = body.innerHTML;
  new Function(noRoomScript(specs))();
  const positions = (document.documentElement.getAttribute(NO_ROOM_ATTR) ?? "").split(" ").filter(Boolean).map(Number);
  const heads = [...document.querySelectorAll("thead th")];
  return positions.map((p) => heads[p - 1].getAttribute("data-matrx-table-column-id")!);
}
let tableHtmlBefore = "";

const widths = [1280, 1100, 1024, 900, 800, 700];
it.each(widths)("at %ipx the server paint hides exactly what React's rule hides", (w) => {
  const available = Math.floor(w / 8) * 8;
  const expected = columnsWithoutRoom(HOME, [], available);
  expect(paint(available).sort()).toEqual([...expected].sort());
});
it("hides at least one column where the table does not fit (so the test cannot pass vacuously)", () => {
  expect(paint(800).length).toBeGreaterThan(0);
});
it("never touches the table's own markup, so React hydrates it without a mismatch", () => {
  paint(800);
  expect(document.getElementById("b")!.innerHTML.replace(/<script><\/script>/, "")).toBe(
    tableHtmlBefore.replace(/<script><\/script>/, ""),
  );
  expect(document.querySelectorAll(`table [${NO_ROOM_ATTR}]`).length).toBe(0);
});
it("the CSS hides each marked position, header and cells alike, and never the name", () => {
  expect(NO_ROOM_CSS).toContain(`html[${NO_ROOM_ATTR}~="3"]`);
  expect(NO_ROOM_CSS).toContain(":is(th,td):nth-child(3)");
  expect(paint(800)).not.toContain("name");
});
it("a column the person already hid does not count against the room", () => {
  const without = HOME.filter((s) => s.id !== "kind").map((s) => s.id);
  const total = HOME.reduce((s, c) => s + (c.column.width as number), 0) - 120 + ROW_ACTIONS_WIDTH;
  expect(paint(Math.ceil(total / 8) * 8, HOME, without)).toEqual([]);
});
it("clearNoRoomMarks hands the table back to React", () => {
  paint(800);
  clearNoRoomMarks();
  expect(document.documentElement.hasAttribute(NO_ROOM_ATTR)).toBe(false);
});
