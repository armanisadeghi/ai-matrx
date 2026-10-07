/**
 * An Update form says "Unchanged" on every control nobody touched, and no
 * working control looks disabled.
 *
 * THE DEFECTS (G10A review, 2026-10-02, nightly clone):
 *   - Task Update: Assignee read "Unassigned" while every other field read
 *     "Unchanged" — it read as "this will unassign". Date inputs showed the
 *     browser's "mm/dd/yyyy".
 *   - Assignee and Repeat drew their empty state at 50% muted text, so two
 *     working controls looked disabled.
 *
 * The word comes from ONE place (`emptyFieldLabel` in schemaFields.ts) for
 * every field kind; this renders one field of every kind a human form shows.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { deriveSchemaFields, humanFormFields } from "@/features/directive-catalog/schemaFields";
import { SchemaFieldsForm } from "@/features/directive-catalog/components/SchemaFieldsForm";

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

const opt = (inner: object, title: string) => ({ anyOf: [inner, { type: "null" }], default: null, title });

/** One field of every kind the Task update form shows a person. */
const TASK_UPDATE = {
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
  },
};

const fields = humanFormFields(
  deriveSchemaFields(TASK_UPDATE, {
    titleColumn: "title",
    resolveRecordToken: (key) =>
      key === "assignee_id" ? "user_profile" : key === "project_id" ? "project" : null,
  }),
);

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Each field row: its label, and everything a person reads in its control. */
async function renderRows(mode: "create" | "update") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <SchemaFieldsForm fields={fields} values={{}} mode={mode} moreOpenByDefault onChange={() => undefined} />,
    );
  });
  const rows = [...container.querySelectorAll("label")].map((label) => {
    const row = label.parentElement!.parentElement!;
    const placeholders = [...row.querySelectorAll("input, textarea")]
      .map((el) => el.getAttribute("placeholder") ?? "")
      .join(" ");
    return { label: label.textContent ?? "", row, reads: `${row.textContent} ${placeholders}` };
  });
  return { rows, done: () => { act(() => root.unmount()); container.remove(); } };
}

describe("an Update form nobody has touched", () => {
  it("every control reads Unchanged — never Unassigned, Does not repeat or a date mask", async () => {
    const { rows, done } = await renderRows("update");
    expect(rows.map((r) => r.label)).toEqual(
      expect.arrayContaining(["Assignee", "Project", "Due Date", "Repeat", "Status", "Estimate"]),
    );
    for (const r of rows) {
      expect({ field: r.label, reads: r.reads }).toEqual({
        field: r.label,
        reads: expect.stringContaining("Unchanged"),
      });
      expect(r.reads).not.toMatch(/Unassigned|Does not repeat|mm\/dd|Not set/);
    }
    done();
  });

  it("no working control draws its text faded, as if disabled", async () => {
    for (const mode of ["update", "create"] as const) {
      const { rows, done } = await renderRows(mode);
      for (const r of rows) {
        // Text, not icons: a chevron at half opacity is the Select's own glyph.
        const faded = [r.row, ...r.row.querySelectorAll("*")]
          .filter((el) => !el.closest("svg"))
          .map((el) => el.getAttribute("class") ?? "")
          .filter((c) => /(^|\s)(text-muted-foreground\/\d+|text-foreground\/[1-6]\d|opacity-[1-6]0)(\s|$)/.test(c));
        expect({ field: r.label, mode, faded }).toEqual({ field: r.label, mode, faded: [] });
      }
      done();
    }
  });

  it("every date kind is the package DateField — never a browser box or the borrowed task picker (G16)", async () => {
    const kinds: Record<string, string> = { "Due Date": "date", Starts: "datetime", "Remind On": "time" };
    for (const mode of ["update", "create"] as const) {
      const { rows, done } = await renderRows(mode);
      for (const [label, kind] of Object.entries(kinds)) {
        const row = rows.find((r) => r.label === label)?.row;
        const capsules = row ? [...row.querySelectorAll('[data-matrx-control="date-field"]')] : [];
        const native = row?.querySelectorAll('input[type="date"], input[type="time"], input[type="datetime-local"]').length ?? -1;
        // The borrowed TaskDueDatePicker trigger: a bare popover button outside any date-field capsule.
        const borrowed = row
          ? [...row.querySelectorAll('button[aria-haspopup="dialog"]')].filter((b) => !b.closest('[data-matrx-control="date-field"]')).length
          : -1;
        const placeholder = capsules[0]?.querySelector("input")?.getAttribute("placeholder") ?? null;
        expect({ label, mode, capsules: capsules.length, kind: capsules[0]?.getAttribute("data-mode") ?? null, native, borrowed, placeholder }).toEqual({
          label,
          mode,
          capsules: 1,
          kind,
          native: 0,
          borrowed: 0,
          placeholder: mode === "update" ? "Unchanged" : kind === "time" ? "Pick a time" : "Pick a date",
        });
      }
      done();
    }
  });

  it("a Create form keeps its own empty words", async () => {
    const { rows, done } = await renderRows("create");
    const reads = (label: string) => rows.find((r) => r.label === label)!.reads;
    expect(reads("Assignee")).toContain("Unassigned");
    expect(reads("Repeat")).toContain("Does not repeat");
    expect(reads("Status")).not.toContain("Unchanged");
    done();
  });
});
