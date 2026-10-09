import { BOARD_ITEM_TYPES } from "../items/catalog";
import { BOARD_PRESETS } from "../presets/registry";
import { badPresetEntries, resolvePresetTypes, type BoardPreset } from "../presets/board-preset";

const keys = new Set(BOARD_ITEM_TYPES.map((t) => t.key));
const groups = new Set(BOARD_ITEM_TYPES.map((t) => t.group));

describe("board presets", () => {
  for (const [name, preset] of Object.entries(BOARD_PRESETS) as [string, BoardPreset][]) {
    it(`${name}: every key exists in BOARD_ITEM_TYPES`, () => {
      expect(badPresetEntries(preset, keys, groups)).toEqual([]);
    });
    it(`${name}: featured resolves, nothing hidden is allowed`, () => {
      const r = resolvePresetTypes(preset, BOARD_ITEM_TYPES);
      expect(r.featured.length).toBe(new Set(preset.featured).size);
      const hidden = new Set(resolvePresetTypes({ ...preset, featured: preset.hidden ?? [], more: [], hidden: [] }, BOARD_ITEM_TYPES).featured);
      for (const t of r.allowed) expect(hidden.has(t)).toBe(false);
    });
  }

  it("marketing-social features the five social tiles first", () => {
    expect(BOARD_PRESETS["marketing-social"].featured.slice(0, 5)).toEqual([
      "social-post",
      "social-profile",
      "social-outlier-feed",
      "social-ad",
      "social-swipe-collection",
    ]);
  });

  it("the guard catches a bad key", () => {
    const bad: BoardPreset = { key: "x", label: "x", featured: ["chat", "no-such-type", "group:nope"], more: "rest" };
    expect(badPresetEntries(bad, keys, groups)).toEqual(["no-such-type", "group:nope"]);
  });

  it("no preset = everything featured, nothing behind More", () => {
    const r = resolvePresetTypes(undefined, BOARD_ITEM_TYPES);
    expect(r.featured).toBe(BOARD_ITEM_TYPES);
    expect(r.more).toEqual([]);
  });

  it("marketing-social: featured first, rest behind More, hidden excluded, guest filter first", () => {
    const p: BoardPreset = { ...BOARD_PRESETS["marketing-social"], hidden: ["task"] };
    const r = resolvePresetTypes(p, BOARD_ITEM_TYPES);
    expect(r.featured.map((t) => t.key)).toEqual([...p.featured]);
    expect(r.more.some((t) => t.key === "task")).toBe(false);
    expect(r.allowed.length).toBe(BOARD_ITEM_TYPES.length - 1);
    const guest = resolvePresetTypes(p, BOARD_ITEM_TYPES.filter((t) => t.guestSafe));
    for (const t of guest.allowed) expect(t.guestSafe).toBe(true);
  });
});
