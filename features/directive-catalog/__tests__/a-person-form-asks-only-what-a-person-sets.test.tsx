/**
 * The Create / Update form in "Add a reference" asks a person only what a
 * person sets, in a person's words.
 *
 * THE DEFECT (G5 review, 2026-10-02, nightly clone): Task create offered
 * "Completed At" (set by completing the task), "Timezone" (the person's own
 * setting) and a raw Assignee id; a note's title field read "label".
 *
 * The schemas below are the task / note create item schemas the clone server
 * published on 2026-10-02 (`GET /directives/catalog`), trimmed to the fields
 * this guard is about.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  deriveSchemaFields,
  humanFormFields,
} from "@/features/directive-catalog/schemaFields";
import {
  formTitleColumn,
  payloadFieldEntityInfo,
} from "@/features/directive-catalog/identityPicker";
import { SchemaFieldsForm } from "@/features/directive-catalog/components/SchemaFieldsForm";

jest.mock("@/features/tasks/components/TaskAssigneePicker", () => ({
  __esModule: true,
  default: () => <div data-testid="people-search">people</div>,
}));
jest.mock("@/features/matrx-envelope/components/ReferenceTypeAdder", () => ({
  RecordReferencePicker: () => <div data-testid="record-search">records</div>,
}));

const opt = (inner: object, title: string) => ({
  anyOf: [inner, { type: "null" }],
  default: null,
  title,
});

const TASK_CREATE = {
  type: "object",
  required: ["title"],
  properties: {
    title: { title: "Title", type: "string" },
    status: opt({ type: "string" }, "Status"),
    assignee_id: opt({ type: "string" }, "Assignee Id"),
    completed_at: opt({ type: "string", format: "date-time" }, "Completed At"),
    due_date: opt({ type: "string", format: "date" }, "Due Date"),
    timezone: opt({ type: "string" }, "Timezone"),
  },
};

const NOTE_CREATE = {
  type: "object",
  properties: {
    label: { ...opt({ type: "string" }, "Label"), default: "New Note" },
    content: opt({ type: "string" }, "Content"),
  },
};

function formFor(noun: { noun: string; title_column?: string | null }, schema: object) {
  return humanFormFields(
    deriveSchemaFields(schema, {
      titleColumn: formTitleColumn(noun),
      resolveRecordToken: (key) => payloadFieldEntityInfo(key, noun.noun)?.token ?? null,
    }),
  );
}

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("a write form asks only what a person sets", () => {
  it("Task create never asks for Completed At or Timezone", () => {
    const keys = formFor({ noun: "task", title_column: "title" }, TASK_CREATE).map((f) => f.key);
    expect(keys).not.toContain("completed_at");
    expect(keys).not.toContain("timezone");
    expect(keys).toEqual(expect.arrayContaining(["title", "status", "assignee_id", "due_date"]));
  });

  it("a note's title reads Title, even when the server leaves title_column out", () => {
    for (const noun of [
      { noun: "note", title_column: "label" },
      { noun: "note", title_column: null },
      { noun: "note" },
    ]) {
      const labels = formFor(noun, NOTE_CREATE).map((f) => f.label);
      expect(labels).toContain("Title");
      expect(labels.map((l) => l.toLowerCase())).not.toContain("label");
    }
  });

  it("Assignee is the people search, never a record list or an id box", () => {
    const fields = formFor({ noun: "task", title_column: "title" }, TASK_CREATE);
    const assignee = fields.find((f) => f.key === "assignee_id")!;
    expect(assignee.label).toBe("Assignee");
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <SchemaFieldsForm
          fields={[assignee]}
          values={{}}
          mode="create"
          onChange={() => undefined}
          moreOpenByDefault
        />,
      );
    });
    expect(container.querySelector('[data-testid="people-search"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="record-search"]')).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    act(() => root.unmount());
  });
});
