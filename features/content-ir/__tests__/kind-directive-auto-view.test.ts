/**
 * THE AUTO-VIEW (KD4) — every enrolled noun gets a legible view for free.
 *
 * The prefix rule gives a shape a RENDERER; the catalog gives it a NAME. A
 * directive the frontend has never heard of must read as "Create Agent ·
 * Agents", never as `directive_v1_create_agent` and never as a blank card.
 * `label` / `family` / `title_column` come from the mirrored catalog
 * (platform.entity_types), so this is derived, not a second hand-kept list.
 */

import {
  directiveDisplay,
  nounFamily,
  nounLabel,
  nounTitleColumn,
} from "@/features/content-ir/directives/nounDisplay";

describe("catalog-derived naming", () => {
  it("names a catalogued noun the way the catalog does", () => {
    expect(nounLabel("agent")).toBe("Agent");
    expect(nounFamily("agent")).toBe("Agents");
    expect(nounTitleColumn("agent")).toBe("name");
  });

  it("reads the whole card line from the class + the catalog", () => {
    expect(directiveDisplay("create", "agent")).toEqual({
      noun: "Agent",
      family: "Agents",
      action: "Create",
      title: "Create Agent",
    });
    expect(directiveDisplay("reference", "agent").title).toBe("Reference Agent");
  });

  it("degrades to an honest title-cased token, never to a slug or a blank", () => {
    // A Kind Action is not an entity_types noun; a noun added server-side since
    // the last mirror is not either. Both must still be legible.
    expect(nounLabel("plan_node_patch")).toBe("Plan node patch");
    expect(nounFamily("plan_node_patch")).toBe("");
    expect(directiveDisplay("action", "plan_node_patch").title).toBe(
      "Run Plan node patch",
    );
    expect(nounLabel("a_noun_invented_today")).toBe("A noun invented today");
  });

  it("says what a class DOES, in the user's words, for every class", () => {
    // A closed vocabulary means this table can never be partial by surprise.
    for (const cls of [
      "reference",
      "view",
      "create",
      "update",
      "delete",
      "action",
      "validation",
      "secret",
    ] as const) {
      const display = directiveDisplay(cls, "task");
      expect(display.action).not.toBe("");
      expect(display.title).toBe(`${display.action} Task`);
    }
  });
});
