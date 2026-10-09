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
  CONNECTED_FULL_FLOOR_CHARS,
  CONNECTED_FULL_TOTAL_CHARS,
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

  it("connected sources (a chat tile's lines) carry full values OUTSIDE the basics budget, so the fair share of everyone else holds", async () => {
    const { index, rows } = build(40);
    const connectedIds = new Set([rows[3].id, rows[9].id, rows[20].id]);
    const withLines = rows.map((r) => ({ ...r, live: false, ...(connectedIds.has(r.id) ? { connected: true } : {}) }));
    const overview = await boardItemsOverview(withLines, index);
    const connected = overview.items.filter((i) => i.connected);
    expect(connected).toHaveLength(3);
    for (const item of connected) {
      expect(String((item.full_values as Record<string, unknown>).note_body)).toContain("Second paragraph");
      expect(item.basics).toBeUndefined();
    }
    // everyone else keeps the board's normal basics, still within the budget the connected ones do not eat
    const others = overview.items.filter((i) => !i.connected);
    expect(others).toHaveLength(37);
    for (const item of others) expect(item.full_values).toBeUndefined();
    expect(others.reduce((s, i) => s + JSON.stringify(i.basics).length, 0)).toBeLessThanOrEqual(
      BOARD_ITEMS_BRIEF_BUDGET_CHARS,
    );
    // the share of the others is computed over THEM alone (3 connected rows do not shrink it)
    const baseline = await boardItemsOverview(
      rows.slice(0, 37).map((r) => ({ ...r, live: false })),
      index,
    );
    expect(overview.limits.basics_chars_per_item).toBe(baseline.limits.basics_chars_per_item);
  });

  it("a connected source that is the live tile still carries its full values", async () => {
    const { index, rows } = build(3);
    const overview = await boardItemsOverview([{ ...rows[0], live: true, connected: true }, rows[1], rows[2]], index);
    expect(overview.items[0].full_values).toBeDefined();
    expect(overview.items[0].basics_note).toBeUndefined();
  });

  it("connected sources never blow the inline cap of the rest, and a crowd of them shares CONNECTED_FULL_TOTAL_CHARS", async () => {
    const { index, rows } = build(30);
    const big = "x".repeat(15_000);
    for (const r of rows) {
      index.set(r.id, {
        primary: () => ({
          surfaceName: SURFACE,
          getScope: () => ({ note_title: r.title, note_body: big, note_tags: ["a"], note_folder: "f" }),
        }),
      } as unknown as SurfaceRegistry);
    }
    const all = rows.map((r) => ({ ...r, live: false, connected: true }));
    const overview = await boardItemsOverview(all, index);
    const full = overview.items.reduce((s, i) => s + JSON.stringify(i.full_values ?? {}).length, 0);
    // 30 sources: each gets the floor share; together they stay near the total, never 30 x 15k
    expect(full).toBeLessThanOrEqual(CONNECTED_FULL_TOTAL_CHARS + 30 * CONNECTED_FULL_FLOOR_CHARS);
    expect(full).toBeLessThan(30 * 15_000);
  });
});
