// Notion's "New property" list (R42, PARITY F5): every type a person can add, by Notion's name, and what each
// sends — Status starts with its three groups, Formula / Rollup open the column panel, ID is the record number.
import { madeAt, matchTypes, PROPERTY_TYPES, STATUS_START } from "../NewProperty";

describe("New property offers Notion's types", () => {
  const byLabel = new Map(PROPERTY_TYPES.map((t) => [t.label, t]));

  it("lists every Notion type the store can hold, in Notion's order", () => {
    expect(PROPERTY_TYPES.map((t) => t.label)).toEqual([
      "Text", "Number", "Select", "Multi-select", "Status", "Date", "Person", "Files & media", "Checkbox", "URL", "Email", "Phone",
      "Formula", "Relation", "Rollup", "Created time", "Created by", "Last edited time", "Last edited by", "ID",
    ]);
  });

  it("maps each to the store's word", () => {
    const words = Object.fromEntries(PROPERTY_TYPES.map((t) => [t.label, t.type]));
    expect(words).toMatchObject({ Status: "status", Person: "member", "Files & media": "attachment", Formula: "formula", Rollup: "rollup", Relation: "relation", "Created time": "created_time", "Created by": "created_by", "Last edited time": "modified_time", "Last edited by": "modified_by", ID: "autonumber" });
  });

  it("starts a Status with Not started / In progress / Done in To-do / In progress / Complete", () => {
    const status = byLabel.get("Status")!;
    expect(status.options).toEqual(["Not started", "In progress", "Done"]);
    expect(status.declaration).toEqual({ status_groups: { "Not started": "todo", "In progress": "in_progress", Done: "done" } });
    expect(STATUS_START.options.every((o) => o in STATUS_START.groups)).toBe(true);
  });

  it("opens the column panel for Formula and Rollup, the database picker for Relation", () => {
    expect(byLabel.get("Formula")!.configure).toBe(true);
    expect(byLabel.get("Rollup")!.configure).toBe(true);
    expect(byLabel.get("Relation")!.relation).toBe(true);
  });

  it("finds types by Notion's synonyms", () => {
    expect(matchTypes("sum").map((t) => t.label)).toContain("Rollup");
    expect(matchTypes("calc").map((t) => t.label)).toContain("Formula");
    expect(matchTypes("updated").map((t) => t.label)).toEqual(["Last edited time", "Last edited by"]);
  });

  it("orders relation targets newest first by the stamp Spaces puts on a table's address", () => {
    const older = `vendors_${(1_700_000_000_000).toString(36)}`;
    const newer = `vendors_${(1_800_000_000_000).toString(36)}`;
    expect(madeAt(newer)).toBeGreaterThan(madeAt(older));
    expect(madeAt("crm_contacts")).toBe(0);
    expect(madeAt("customer")).toBe(0);
  });
});
