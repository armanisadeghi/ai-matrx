import type { Field } from "@ai-matrx/records/react";

import { effectiveHidden, viewSpec } from "../view-spec";

const f = (key: string, type = "text") => ({ key, label: key, type, parity_type: type }) as unknown as Field;
const fields = [f("name"), f("budget", "number"), f("status", "status"), f("region"), f("notes"), f("channel"), f("phase"), f("due", "date")];

describe("card fields", () => {
  it("a new board hides every property past the first four (title, group and dates aside)", () => {
    const hidden = effectiveHidden({ layout: "kanban", groupField: "status", dateField: null }, fields);
    expect(hidden).toEqual(["phase"]);
    expect(hidden).not.toContain("due");
  });
  it("a grid hides nothing by default", () => {
    expect(effectiveHidden({ layout: "grid" }, fields)).toEqual([]);
  });
  it("a saved list wins, including an empty one", () => {
    expect(effectiveHidden({ layout: "gallery", hiddenFields: [] }, fields)).toEqual([]);
    expect(effectiveHidden({ layout: "gallery", hiddenFields: ["notes"] }, fields)).toEqual(["notes"]);
  });
  it("card layouts save cardHidden, a grid saves hiddenFields", () => {
    const board = viewSpec("t", { id: "v", name: "Board", layout: "kanban", groupField: "status" }, fields);
    expect(board.presentation?.cardHidden).toEqual(["phase"]);
    const grid = viewSpec("t", { id: "v", name: "All", layout: "grid", hiddenFields: ["notes"] }, fields);
    expect(grid.presentation?.hiddenFields).toEqual(["notes"]);
    expect(grid.presentation?.cardHidden).toBeUndefined();
  });
});
