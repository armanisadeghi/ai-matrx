/**
 * The collapsed run form must draw the same component as the expanded one.
 *
 * Fixtures are the live variable definitions of the "Feedback triage" agents
 * (44d3b270…, 143f5d37…) read from `agent.definition.variable_definitions`
 * on 2026-09-23: `filed_type` and `filed_priority` are selects and were drawn
 * as free-text boxes in the collapsed row.
 */

import { collapsedRowKind } from "../collapsed-row";
import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";

const triage: Record<string, VariableCustomComponent> = {
  description: { type: "textarea" },
  route: { type: "url" },
  filed_type: {
    type: "select",
    options: ["bug", "feature", "suggestion", "other"],
  },
  filed_priority: {
    type: "select",
    options: ["low", "medium", "high", "critical"],
  },
  comments: { type: "textarea" },
};

describe("collapsedRowKind", () => {
  it("draws a select as its component, never a text box", () => {
    expect(collapsedRowKind(triage.filed_type)).toBe("component");
    expect(collapsedRowKind(triage.filed_priority)).toBe("component");
  });

  it("keeps free text as a one-line box", () => {
    expect(collapsedRowKind(triage.description)).toBe("text-line");
    expect(collapsedRowKind(triage.route)).toBe("text-line");
    expect(collapsedRowKind(undefined)).toBe("text-line");
  });

  it("draws every other structured input as its component", () => {
    for (const type of [
      "toggle",
      "light-switch",
      "number",
      "slider",
      "datetime",
      "color",
    ] as const) {
      expect(collapsedRowKind({ type })).toBe("component");
    }
    expect(collapsedRowKind({ type: "radio", options: ["a", "b"] })).toBe(
      "component",
    );
  });

  it("a choice with no options falls back to text, exactly as the expanded editor does", () => {
    expect(collapsedRowKind({ type: "select", options: [] })).toBe("text-line");
  });

  it("media and picklist-bound variables open the editor instead of posing as text", () => {
    expect(collapsedRowKind({ type: "image" })).toBe("open-editor");
    expect(collapsedRowKind({ type: "document" })).toBe("open-editor");
    expect(collapsedRowKind(triage.filed_type, { picklistBound: true })).toBe(
      "open-editor",
    );
  });
});
