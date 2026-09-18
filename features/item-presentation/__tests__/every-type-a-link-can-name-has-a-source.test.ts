// 🚨 NEW-9 (VERIFY-U-P1-R3) — THE CENSUS BEHIND THE CLASS.
//
// `/detail/<type>/<id>` is a URL anyone can build for any registered item type.
// Five types had no `detailSource` at `e64a912f` — agent, note, session,
// structured_list, picklist — so every one of them took the "nothing is
// registered" path with `seed: null` from the page route. Four of them DO have
// one canonical table: the very one their own `enrich` already reads. Reusing
// that source (never a second loader) leaves exactly one honest absentee.

import { getItemConfig } from "../registry";
import type { KnownItemType } from "../types";

/** The types the round-3 census found sourceless. */
const CENSUS: KnownItemType[] = ["agent", "note", "structured_list", "picklist"];

/**
 * `session` is the one type with genuinely no single canonical table (war-room,
 * studio, window and quiz sessions all qualify), so it stays sourceless BY
 * DECISION and the honest absent state carries it.
 */
const DELIBERATELY_SOURCELESS: KnownItemType[] = ["session"];

describe("the sourceless census", () => {
  for (const type of CENSUS) {
    it(`${type} reads the canonical table its own enrichment already reads`, () => {
      const { config, recognized } = getItemConfig(type);
      expect(recognized).toBe(true);
      expect(config.detailSource).toBeDefined();
      expect(typeof config.detailSource?.table).toBe("string");
      expect(config.detailSource?.titleField).toBeTruthy();
    });
  }

  for (const type of DELIBERATELY_SOURCELESS) {
    it(`${type} stays sourceless on purpose, and the reason is written down`, () => {
      expect(getItemConfig(type).config.detailSource).toBeUndefined();
    });
  }

  it("agent, note and the structured lists point at the tables they are stored in", () => {
    expect(getItemConfig("agent").config.detailSource).toMatchObject({
      table: "definition",
      schemaName: "agent",
    });
    expect(getItemConfig("note").config.detailSource).toMatchObject({
      table: "notes",
      schemaName: "workbench",
    });
    expect(getItemConfig("structured_list").config.detailSource).toMatchObject({
      table: "udt_structured_lists",
      schemaName: "workbench",
    });
    expect(getItemConfig("picklist").config.detailSource).toMatchObject({
      table: "udt_structured_lists",
      schemaName: "workbench",
    });
  });
});
