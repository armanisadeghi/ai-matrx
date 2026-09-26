import { decideChoiceNudge } from "../choice-option-nudge";

const status = {
  id: "f1",
  field_name: "status",
  display_name: "Status",
  data_type: "string",
  metadata: { format: { id: "choice", options: { choices: [{ value: "AVAILABLE" }, { value: "MAXED" }] } } },
};

describe("choice option nudge", () => {
  it("offers a value the column does not declare", () => {
    expect(decideChoiceNudge(status, "ACTIVE")).toMatchObject({ kind: "offer", values: ["ACTIVE"] });
  });
  it("stays quiet for a declared value, an empty value, and a plain text column", () => {
    expect(decideChoiceNudge(status, "MAXED").kind).toBe("none");
    expect(decideChoiceNudge(status, "").kind).toBe("none");
    expect(decideChoiceNudge({ ...status, metadata: { format: { id: "text" } } }, "ACTIVE").kind).toBe("none");
  });
  it("offers only the missing values of a multi-choice cell", () => {
    const multi = { ...status, metadata: { format: { id: "multi_choice", options: { choices: [{ value: "a" }] } } } };
    expect(decideChoiceNudge(multi, ["a", "b", "c", "b"])).toMatchObject({ kind: "offer", values: ["b", "c"] });
  });
  it("says so when the options come from a shared list instead of offering an inline option", () => {
    const bound = { ...status, metadata: { format: { id: "choice", options: { structuredList: { listId: "l1" } } } } };
    expect(decideChoiceNudge(bound, "ACTIVE")).toMatchObject({ kind: "list_bound", values: ["ACTIVE"] });
  });
  it("never offers for a person column", () => {
    expect(decideChoiceNudge({ ...status, metadata: { format: { id: "person" } } }, "u1").kind).toBe("none");
  });
});
