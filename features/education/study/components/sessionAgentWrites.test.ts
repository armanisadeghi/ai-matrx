import { parseSessionDeletes } from "./sessionAgentWrites";

const shown = [
  { id: "completed-1", version: 4, status: "completed" },
  { id: "abandoned-1", version: 2, status: "abandoned" },
  { id: "active-1", version: 3, status: "active" },
];

describe("session agent deletion", () => {
  it("accepts only visible terminal sessions at their loaded revisions", () => {
    expect(parseSessionDeletes([{ id: "completed-1", version: 4 }], shown)).toEqual([
      { id: "completed-1", version: 4 },
    ]);
    expect(parseSessionDeletes([{ id: "abandoned-1", version: 2 }], shown)).toEqual([
      { id: "abandoned-1", version: 2 },
    ]);
  });

  it("refuses active, stale, and unloaded rows before approval", () => {
    expect(() => parseSessionDeletes([{ id: "active-1", version: 3 }], shown)).toThrow(/in-progress/);
    expect(() => parseSessionDeletes([{ id: "completed-1", version: 3 }], shown)).toThrow(/changed/);
    expect(() => parseSessionDeletes([{ id: "other-1", version: 1 }], shown)).toThrow(/not currently visible/);
  });
});
