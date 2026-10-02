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
import { valueVocabularyFor } from "@/features/directive-catalog/valueVocabulary";
import { recordFactFromRow } from "@/features/scopes/service/recordFacts";

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

/**
 * G6B review (2026-10-02, nightly clone): Note offered "Position" and BOTH
 * "Folder" and "Folder Name"; Project offered "Slug"; Task offered a free-text
 * "Recurrence Rule"; status lists printed stored values ("inbox",
 * "incomplete") while the Task window says "In progress". The schemas are the
 * ones the clone server published (`GET /directives/catalog`), trimmed.
 */
describe("a write form speaks the record's own words", () => {
  const NOTE_FULL = {
    type: "object",
    properties: {
      label: { ...opt({ type: "string" }, "Label"), default: "New Note" },
      folder_id: opt({ type: "string" }, "Folder Id"),
      folder_name: { ...opt({ type: "string" }, "Folder Name"), default: "General" },
      position: { ...opt({ type: "integer" }, "Position"), default: 0 },
    },
  };
  const PROJECT_CREATE = {
    type: "object",
    required: ["name"],
    properties: {
      name: { title: "Name", type: "string" },
      slug: opt({ type: "string" }, "Slug"),
      status: {
        ...opt({ type: "string", enum: ["planning", "active", "paused", "completed", "archived"] }, "Status"),
        default: "active",
      },
    },
  };
  const TASK_STATUS = {
    type: "object",
    required: ["title"],
    properties: {
      title: { title: "Title", type: "string" },
      status: {
        ...opt(
          {
            type: "string",
            enum: ["inbox", "planned", "active", "incomplete", "completed", "cancelled", "dismissed"],
          },
          "Status",
        ),
        default: "incomplete",
      },
      recurrence_rule: opt({ type: "string" }, "Recurrence Rule"),
    },
  };

  const form = (noun: string, title: string, schema: object) =>
    humanFormFields(
      deriveSchemaFields(schema, {
        titleColumn: title,
        resolveRecordToken: (key) => payloadFieldEntityInfo(key, noun)?.token ?? null,
        resolveValueVocabulary: (key) => valueVocabularyFor(noun, key),
      }),
    );

  it("derived and duplicate fields leave the human form", () => {
    const note = form("note", "label", NOTE_FULL).map((f) => f.key);
    expect(note).not.toContain("folder_name");
    expect(note).not.toContain("position");
    expect(form("project", "name", PROJECT_CREATE).map((f) => f.key)).not.toContain("slug");
  });

  it("status values read as the task and project screens say them", () => {
    const status = form("task", "title", TASK_STATUS).find((f) => f.key === "status")!;
    expect(status.enumValues).not.toContain("incomplete"); // means Inbox — one choice per meaning
    expect(status.enumLabels.active).toBe("In progress");
    expect(status.enumLabels.inbox).toBe("Inbox");
    expect(status.enumLabels.incomplete).toBe("Inbox");
    const project = form("project", "name", PROJECT_CREATE).find((f) => f.key === "status")!;
    expect(project.enumLabels.planning).toBe("Planning");

    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <SchemaFieldsForm
          fields={[status]}
          values={{}}
          mode="create"
          onChange={() => undefined}
          moreOpenByDefault
        />,
      );
    });
    expect(container.textContent).toContain("Default (Inbox)");
    expect(container.textContent).not.toContain("incomplete");
    act(() => root.unmount());
  });

  it("repeat is the task editor's repeat picker, never a text box", () => {
    const rule = form("task", "title", TASK_STATUS).find((f) => f.key === "recurrence_rule")!;
    expect(rule.kind).toBe("recurrence");
    expect(rule.label).toBe("Repeat");
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <SchemaFieldsForm
          fields={[rule]}
          values={{}}
          mode="create"
          onChange={() => undefined}
          moreOpenByDefault
        />,
      );
    });
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain("Does not repeat");
    act(() => root.unmount());
  });
});

/**
 * The record search's secondary line names a task's status the same way
 * (G6B browser check, nightly clone: "Ashford Labs · Incomplete · Edited 4 min
 * ago" while the Task window says "Inbox").
 */
describe("the record search speaks the same status words", () => {
  it("a task's stored status reads as the task screens say it", () => {
    expect(recordFactFromRow("task", { status: "incomplete" }).fact).toBe("Inbox");
    expect(recordFactFromRow("task", { status: "active" }).fact).toBe("In progress");
    expect(recordFactFromRow("project", { status: "planning" }).fact).toBe("Planning");
  });
});
