/**
 * The write form is ONE control family: every control is a
 * `@ai-matrx/design-system/controls` control (one 28px geometry), and the two
 * app pickers (people, repeat) sit on the same tokens.
 *
 * THE DEFECT (G17, 2026-10-07): the Create / Update form mixed heights — text
 * boxes were 36px one-row textareas and the number box an `h-9` input, while
 * the dates and pick-lists beside them were the 28px package controls; the
 * record, people and repeat triggers were hand-built 36px / 44px buttons.
 */
import React, { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot } from "react-dom/client";
import { deriveSchemaFields } from "@/features/directive-catalog/schemaFields";
import {
  SCHEMA_PICKER_GEOMETRY,
  SchemaFieldsForm,
} from "@/features/directive-catalog/components/SchemaFieldsForm";

jest.mock("@/features/messaging/hooks/useUserConnections", () => ({
  useUserConnections: () => ({
    connections: [],
    isLoading: false,
    error: null,
    partialFailures: [],
    refresh: () => undefined,
  }),
}));
jest.mock("@/features/user-search/UserSearchField", () => ({
  UserSearchField: () => null,
}));
jest.mock("@/features/matrx-envelope/components/ReferenceTypeAdder", () => ({
  RecordReferencePicker: () => <div>records</div>,
}));

const SOURCE = readFileSync(
  join(__dirname, "..", "components", "SchemaFieldsForm.tsx"),
  "utf8",
);

const opt = (inner: object, title: string) => ({ anyOf: [inner, { type: "null" }], default: null, title });

/** One field of every kind the form can draw, including the ones a person form hides. */
const EVERY_KIND = {
  type: "object",
  properties: {
    title: opt({ type: "string" }, "Title"),
    status: opt({ type: "string", enum: ["incomplete", "completed"] }, "Status"),
    is_pinned: opt({ type: "boolean" }, "Is Pinned"),
    assignee_id: opt({ type: "string" }, "Assignee Id"),
    project_id: opt({ type: "string" }, "Project Id"),
    due_date: opt({ type: "string", format: "date" }, "Due Date"),
    remind_on: opt({ type: "string", format: "time" }, "Remind On"),
    starts: opt({ type: "string", format: "date-time" }, "Starts"),
    recurrence_rule: opt({ type: "string" }, "Recurrence Rule"),
    estimate: opt({ type: "number" }, "Estimate"),
    count: opt({ type: "integer" }, "Count"),
    meta: opt({ type: "object" }, "Meta"),
  },
};

const fields = deriveSchemaFields(EVERY_KIND, {
  titleColumn: "title",
  resolveRecordToken: (key) =>
    key === "assignee_id" ? "user_profile" : key === "project_id" ? "project" : null,
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FAMILY = ".matrx-control, .matrx-control-textarea, .matrx-control-button";

describe("the write form is one control family (G17)", () => {
  it("its source draws no raw <input>, <textarea>, <select> or <button>, and borrows no app control", () => {
    const raw = SOURCE.match(/<(input|textarea|select|button)[\s>]/g) ?? [];
    const borrowed = SOURCE.match(/from "@\/components\/ui\/(input|textarea|select|button)"/g) ?? [];
    const sized = SOURCE.match(/\b(min-)?h-(9|10|11|8)\b/g) ?? [];
    expect({ raw, borrowed, sized }).toEqual({ raw: [], borrowed: [], sized: [] });
  });

  it("every rendered control is a package control or sits on the package tokens", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    for (const mode of ["create", "update"] as const) {
      await act(async () => {
        root.render(
          <SchemaFieldsForm fields={fields} values={{}} mode={mode} moreOpenByDefault onChange={() => undefined} />,
        );
      });
      const controls = [...container.querySelectorAll("input, textarea, select, button, [role=combobox]")];
      expect(controls.length).toBeGreaterThan(10);
      const offFamily = controls
        .filter((el) => !el.closest(FAMILY))
        .filter((el) => !(el.getAttribute("class") ?? "").includes(SCHEMA_PICKER_GEOMETRY))
        .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("placeholder") || el.getAttribute("aria-label") || "").trim()}" .${el.getAttribute("class") ?? ""}`);
      // Only a JSON field is written over lines; a text box is the one-line capsule.
      const multiline = container.querySelectorAll("textarea").length;
      expect({ mode, offFamily, multiline }).toEqual({ mode, offFamily: [], multiline: 1 });
    }
    act(() => root.unmount());
    container.remove();
  });
});
