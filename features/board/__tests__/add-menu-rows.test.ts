import { BOARD_ITEM_TYPES } from "../items/catalog";
import { BOARD_SECTIONS } from "../items/types";
import {
  RECENT_ADDS_MAX,
  buildAddRows,
  filterAddRows,
  groupBySection,
  pushRecentAdd,
  recentRows,
} from "../home/add-menu-rows";

const rows = buildAddRows(BOARD_ITEM_TYPES);

describe("Add menu rows", () => {
  it("sections come in the order the menu promises, canvas tools first", () => {
    const groups = groupBySection(rows);
    expect(groups.map((g) => g.label)).toEqual(BOARD_SECTIONS.map((s) => s.label).filter((l) => groups.some((g) => g.label === l)));
    expect(groups[0].label).toBe("Canvas");
    expect(groups[0].rows.slice(0, 4).map((r) => r.label)).toEqual(["Sticky note", "Text", "Frame", "Draw"]);
  });

  it("browse offers one Shapes row; the four shapes are found by typing", () => {
    const browse = groupBySection(rows)[0].rows.map((r) => r.label);
    expect(browse).toContain("Shapes");
    expect(browse).not.toContain("Oval");
    expect(filterAddRows(rows, "oval").map((r) => r.label)).toEqual(["Oval"]);
  });

  it("a type that can be started and brought in is ONE row with both doors", () => {
    const note = rows.filter((r) => r.type?.key === "note");
    expect(note).toHaveLength(1);
    expect(note[0].primary.kind).toBe("new");
    expect(note[0].bringIn).toBeDefined();
    // chat has two ways to start (Chat, Chat with an agent): two rows, the picker door on the first only.
    const chats = rows.filter((r) => r.type?.key === "chat");
    expect(chats.map((r) => !!r.bringIn)).toEqual([true, false]);
  });

  it("every catalog type is reachable from some row", () => {
    const offered = BOARD_ITEM_TYPES.filter((t) => t.bringIn || t.startNew);
    expect(offered.filter((t) => !rows.some((r) => r.type?.key === t.key))).toEqual([]);
  });
});

describe("Add menu search", () => {
  it("an empty query keeps every row", () => {
    expect(filterAddRows(rows, "  ")).toHaveLength(rows.length);
  });

  it("type-ahead narrows across sections, best label first", () => {
    const hit = filterAddRows(rows, "tab").map((r) => r.label);
    expect(hit).toContain("New table");
    expect(hit.length).toBeLessThan(rows.length / 2);
    expect(hit[0]).toBe("New table");
    expect(filterAddRows(rows, "zzzz")).toEqual([]);
  });

  it("matches the section and the bring-in name, every word required", () => {
    expect(filterAddRows(rows, "meetings").map((r) => r.label)).toEqual(expect.arrayContaining(["New meeting", "War Room"]));
    expect(filterAddRows(rows, "sticky").map((r) => r.label)).toEqual(["Sticky note"]);
    expect(filterAddRows(rows, "bring zzzz")).toEqual([]);
  });
});

describe("Recent adds", () => {
  it("newest first, no repeats, capped", () => {
    let ids: string[] = [];
    for (const id of ["a", "b", "c", "a", "d", "e", "f"]) ids = pushRecentAdd(ids, id);
    expect(ids).toEqual(["f", "e", "d", "a", "c"]);
    expect(ids).toHaveLength(RECENT_ADDS_MAX);
  });

  it("only offers recents that are still rows, in recency order, never a canvas tool", () => {
    const note = rows.find((r) => r.type?.key === "note")!;
    const table = rows.find((r) => r.type?.key === "data-table")!;
    const out = recentRows(rows, [table.id, "new:gone:0", "tool:pen", note.id]);
    expect(out.map((r) => r.id)).toEqual([table.id, note.id]);
  });
});
