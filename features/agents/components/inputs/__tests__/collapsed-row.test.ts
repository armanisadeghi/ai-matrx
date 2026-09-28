/**
 * The inline (collapsed) variable row is a one-line text box for every typed
 * variable — free typing is the point of this view; the real component lives
 * behind the chevron. See the header of collapsed-row.ts (Arman, 2026-09-27).
 */

import {
  collapsedRowChoices,
  collapsedRowKind,
  toggleMultiValue,
} from "../collapsed-row";
import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";

describe("collapsedRowKind", () => {
  it("every typed variable is a one-line text box, choice types included", () => {
    const cases: (VariableCustomComponent | undefined)[] = [
      undefined,
      { type: "textarea" },
      { type: "url" },
      { type: "select", options: ["low", "medium", "high", "critical"] },
      { type: "radio", options: ["a very detailed", "a well-structured table"] },
      { type: "checkbox", options: ["a", "b"] },
      { type: "buttons", options: ["a", "b"] },
      { type: "selection-list", options: ["a", "b"] },
      { type: "pill-toggle", options: ["a", "b"] },
      { type: "toggle" },
      { type: "number" },
      { type: "slider" },
      { type: "datetime" },
      { type: "color" },
    ];
    for (const customComponent of cases) {
      expect(collapsedRowKind(customComponent)).toBe("text-line");
    }
  });

  it("values that cannot be typed open the editor", () => {
    expect(collapsedRowKind({ type: "image" })).toBe("open-editor");
    expect(collapsedRowKind({ type: "document" })).toBe("open-editor");
    expect(
      collapsedRowKind({ type: "select", options: ["a"] }, { picklistBound: true }),
    ).toBe("open-editor");
  });
});

describe("collapsedRowChoices — choices offered BESIDE the text box", () => {
  it("offers a single-choice list for select, radio, buttons, selection-list and pill-toggle", () => {
    for (const type of [
      "select",
      "radio",
      "buttons",
      "selection-list",
      "pill-toggle",
    ] as const) {
      expect(collapsedRowChoices({ type, options: ["a", "b"] })).toEqual({
        options: ["a", "b"],
        multiple: false,
      });
    }
  });

  it("offers checkbox options as a multiple pick", () => {
    expect(collapsedRowChoices({ type: "checkbox", options: ["a", "b"] })).toEqual({
      options: ["a", "b"],
      multiple: true,
    });
  });

  it("offers a toggle's two values, falling back to No / Yes", () => {
    expect(
      collapsedRowChoices({ type: "toggle", toggleValues: ["Off", "On"] }),
    ).toEqual({ options: ["Off", "On"], multiple: false });
    expect(collapsedRowChoices({ type: "light-switch" })).toEqual({
      options: ["No", "Yes"],
      multiple: false,
    });
  });

  it("offers nothing for free text, numbers, or a choice type with no options", () => {
    expect(collapsedRowChoices(undefined)).toBeNull();
    expect(collapsedRowChoices({ type: "textarea" })).toBeNull();
    expect(collapsedRowChoices({ type: "number" })).toBeNull();
    expect(collapsedRowChoices({ type: "select", options: [] })).toBeNull();
  });
});

describe("toggleMultiValue — the checkbox wire format is newline-joined", () => {
  it("adds, removes, and keeps typed lines it does not own", () => {
    expect(toggleMultiValue("", "Email")).toBe("Email");
    expect(toggleMultiValue("Email", "SMS")).toBe("Email\nSMS");
    expect(toggleMultiValue("Email\nSMS", "Email")).toBe("SMS");
    expect(toggleMultiValue("my own\nEmail", "SMS")).toBe("my own\nEmail\nSMS");
  });
});
