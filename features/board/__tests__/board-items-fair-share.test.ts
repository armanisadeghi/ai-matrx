/**
 * The Board's agent context scales fairly with the number of items: each dormant item gets
 * budget / count of the basics (floor: name + one fact; ceiling: rich), nothing is invisible,
 * and the selected tile always carries its full values.
 */
jest.mock("@/features/surfaces/manifests/registry", () => {
  const manifest = {
    surfaceName: "matrx-user/test-fair-note",
    label: "Note",
    description: "One note.",
    briefValues: ["note_title", "note_body", "note_tags", "note_folder"],
    values: [
      { name: "note_title", label: "Title", description: "t", valueType: "string" },
      { name: "note_body", label: "Body", description: "b", valueType: "string" },
      { name: "note_tags", label: "Tags", description: "g", valueType: "array" },
      { name: "note_folder", label: "Folder", description: "f", valueType: "string" },
    ],
  };
  return { getManifest: (name: string) => (name === manifest.surfaceName ? manifest : undefined) };
});

import {
  BOARD_ITEMS_BRIEF_BUDGET_CHARS,
  BOARD_ITEMS_MAX,
  boardItemsOverview,
  createItemSurfaceIndex,
  type BoardItemRow,
} from "../tools/item-surfaces";
import type { SurfaceRegistry } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";

const SURFACE = "matrx-user/test-fair-note";

function build(count: number, selectedIndex = -1) {
  const index = createItemSurfaceIndex();
  const rows: BoardItemRow[] = [];
  for (let i = 0; i < count; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const scope = {
      note_title: `Landing page copy, revision ${i} for the spring campaign`,
      note_body: `Headline ${i}: we help teams ship faster.\nSecond paragraph with a long explanation of the offer and its terms ${i}.`,
      note_tags: ["web", "copy", "spring"],
      note_folder: `Marketing / Website redo / Round ${i}`,
    };
    index.set(id, { primary: () => ({ surfaceName: SURFACE, getScope: () => scope }) } as unknown as SurfaceRegistry);
    rows.push({ id, title: `Note ${i}`, kind: "note", surface: SURFACE, live: i === 0, selected: i === selectedIndex });
  }
  return { index, rows };
}

describe("board_items fair share", () => {
  it("3 items: every dormant item carries rich basics (4 values)", async () => {
    const { index, rows } = build(3);
    const overview = await boardItemsOverview(rows, index);
    const dormant = overview.items.filter((item) => !item.live);
    expect(dormant).toHaveLength(2);
    for (const item of dormant) expect(Object.keys(item.basics ?? {})).toHaveLength(4);
    expect(overview.read_in_full).toMatch(/board_open_item\(id\)/);
  });

  it("40 items: every dormant item has a name plus one fact, and the total stays under budget", async () => {
    const { index, rows } = build(40);
    const overview = await boardItemsOverview(rows, index);
    const dormant = overview.items.filter((item) => !item.live);
    expect(dormant).toHaveLength(39);
    for (const item of dormant) {
      expect(item.basics_note).toBeUndefined();
      expect(Object.keys(item.basics ?? {}).length).toBeGreaterThanOrEqual(2);
      expect(Object.keys(item.basics ?? {})[0]).toBe("note_title");
      expect(item.id).toMatch(/^00000000/);
    }
    const total = dormant.reduce((sum, item) => sum + JSON.stringify(item.basics).length, 0);
    expect(total).toBeLessThanOrEqual(BOARD_ITEMS_BRIEF_BUDGET_CHARS);
    // fewer details than a small board gives
    const small = await boardItemsOverview(build(3).rows, build(3).index);
    expect(Object.keys(dormant[0].basics ?? {}).length).toBeLessThan(
      Object.keys(small.items.find((i) => !i.live)?.basics ?? {}).length,
    );
  });

  it("at the cap: every listed item still has 2 values and the total is under budget; the rest are a compact tail", async () => {
    const { index, rows } = build(BOARD_ITEMS_MAX + 30);
    const overview = await boardItemsOverview(rows, index);
    expect(overview.items).toHaveLength(BOARD_ITEMS_MAX);
    const dormant = overview.items.filter((item) => !item.live);
    for (const item of dormant) expect(Object.keys(item.basics ?? {}).length).toBeGreaterThanOrEqual(2);
    expect(dormant.reduce((s, i) => s + JSON.stringify(i.basics).length, 0)).toBeLessThanOrEqual(
      BOARD_ITEMS_BRIEF_BUDGET_CHARS,
    );
    expect(overview.more_items).toHaveLength(30);
    expect(overview.more_items?.[0]).toEqual({ id: rows[BOARD_ITEMS_MAX].id, title: rows[BOARD_ITEMS_MAX].title });
    expect(overview.omitted_count).toBe(0);
  });

  it("the selected tile, when not the live one, carries its full values", async () => {
    const { index, rows } = build(40, 7);
    const overview = await boardItemsOverview(rows, index);
    const selected = overview.items[7];
    expect(selected.selected).toBe(true);
    expect(selected.live).toBe(false);
    expect(selected.full_values).toMatchObject({
      note_title: "Landing page copy, revision 7 for the spring campaign",
      note_tags: ["web", "copy", "spring"],
    });
    expect(String((selected.full_values as Record<string, unknown>).note_body)).toContain("Second paragraph");
    expect(selected.basics).toBeUndefined();
  });
});
