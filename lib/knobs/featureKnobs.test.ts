/**
 * `knobStringList` — the JSON-list reader behind org-curated ordered tiers
 * (the reference picker's "types offered first" is the first caller).
 *
 * What these pin is the REFUSAL behaviour. A knob list feeds lookups by token,
 * so a member that is not a string must raise: coerced to text, `null` becomes
 * "null" and simply matches nothing, which is exactly the silent, invisible
 * default the knob system exists to end.
 */

import { invalidateFeatureKnobs, knobStringList } from "./featureKnobs";

const rows: Array<{ feature: string; key: string; value: unknown }> = [];

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => ({
        select: async () => ({ data: rows, error: null }),
      }),
    }),
  }),
}));

function seed(value: unknown): void {
  rows.length = 0;
  rows.push({ feature: "test.picker", key: "common_types", value });
  invalidateFeatureKnobs();
}

describe("knobStringList", () => {
  afterEach(() => {
    invalidateFeatureKnobs();
  });

  it("returns the list in the stored order (order IS the setting)", async () => {
    seed(["conversation", "note", "task"]);
    await expect(knobStringList("test.picker", "common_types")).resolves.toEqual(
      ["conversation", "note", "task"],
    );
  });

  it("accepts an empty list — curating nothing is a legitimate choice", async () => {
    seed([]);
    await expect(knobStringList("test.picker", "common_types")).resolves.toEqual(
      [],
    );
  });

  it("raises when the knob is not an array, instead of yielding one entry", async () => {
    seed("conversation,note");
    await expect(
      knobStringList("test.picker", "common_types"),
    ).rejects.toThrow(/not a JSON array/);
  });

  it("raises on a non-string member rather than coercing it to a dud token", async () => {
    seed(["conversation", null, "task"]);
    await expect(
      knobStringList("test.picker", "common_types"),
    ).rejects.toThrow(/entry 1 is not a string/);
  });

  it("raises when the row is missing — no code fallback, by design", async () => {
    rows.length = 0;
    invalidateFeatureKnobs();
    await expect(
      knobStringList("test.picker", "common_types"),
    ).rejects.toThrow(/Missing feature knob/);
  });
});
