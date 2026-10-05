/**
 * A PASTE NAMES EVERY RECORD, AND THE PERSON CHOOSES WHERE EACH PASTED COLUMN GOES (BREAKER-3 B3-08).
 *
 * MEASURED on the Sheet's "Paste rows" dialog (2026-09-30): a header row
 * `Patient, Referring Doctor, Status, …` into a table whose name column is "Title" read
 * "Patient → (skipped — no matching column)" and "Title — (unmatched dataset column — will be empty)":
 * two patients would have landed with no name, the confirm screen offered no way to send Patient
 * anywhere else, and "dataset column" is a developer's word.
 *
 * THE RULE, the records-ui ImportWizard's "What each record is called" mirrored (not imported):
 * when no pasted header matched the table's name column, the pasted column that names the record
 * goes there — a header that says it is the name (Patient, Name, Title, Customer…), else the
 * worded column whose values differ most — chosen only among the headers nothing else matched.
 * And every pasted column has its own choice of table column, "Skip" included; no table column is
 * ever filled from two pasted columns.
 *
 * RED PROOF — run 2026-09-29 against the pre-fix dialog and matcher: clauses 1, 2, 3 and 5 fail
 * (Patient is skipped, Title "will be empty", there is no choice per column, "dataset column" is on
 * screen, and the helpers do not exist).
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const bulkWrite = jest.fn();
jest.mock("@/features/data-tables/service", () => ({
  bulkWrite: (...args: unknown[]) => bulkWrite(...args),
  addChoicesToColumn: jest.fn(),
}));

import PasteRowsDialog from "@/components/user-generated-table-data/PasteRowsDialog";
import * as headerMatch from "@/features/data-tables/paste-header-match";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/** Cedar Ridge Physical Therapy's referral log: the name column is "Title". */
const FIELDS = [
  ["title", "Title", "string"],
  ["referring_doctor", "Referring Doctor", "string"],
  ["status", "Status", "string"],
  ["sessions_prescribed", "Sessions Prescribed", "integer"],
].map(([field_name, display_name, data_type], i) => ({
  id: `f${i + 1}`,
  field_name,
  display_name,
  data_type,
  is_required: false,
}));

const PASTE =
  "Patient\tReferring Doctor\tStatus\tSessions Prescribed\n" +
  "Maria Delgado\tDr. Hannah Lindqvist\tNew\t12\n" +
  "Sean O'Brien\tDr. Omar Haddad\tScheduled\t8";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  bulkWrite.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function screenText(): string {
  return (document.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

async function pasteAndParse() {
  await act(async () => {
    root.render(
      <PasteRowsDialog
        tableId="cedar-ridge-referrals"
        fields={FIELDS}
        {...({ rowLabelFieldName: "title" } as object)}
        isOpen
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
  });
  const box = document.getElementById("pasteData") as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(box, PASTE);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const parse = [...document.querySelectorAll("button")].find((b) => /parse|next|preview/i.test(b.textContent ?? ""));
  if (!parse) throw new Error("no Parse button");
  await act(async () => {
    parse.click();
  });
}

describe("the Sheet's Paste rows dialog", () => {
  it("1. sends the Patient column to the table's name column when no header is called Title", async () => {
    await pasteAndParse();
    const text = screenText();
    expect(text).not.toContain("no matching column");
    expect(text).not.toContain("will be empty");
    const patient = document.querySelector('[data-matrx-paste-column="Patient"]');
    expect(patient?.textContent ?? "").toContain("Title");
  });

  it("2. offers every pasted column its own choice of table column, Skip included", async () => {
    await pasteAndParse();
    for (const header of ["Patient", "Referring Doctor", "Status", "Sessions Prescribed"]) {
      const row = document.querySelector(`[data-matrx-paste-column="${header}"]`);
      expect(row).not.toBeNull();
      expect(row!.querySelector('[role="combobox"]')).not.toBeNull();
    }
  });

  it("3. never says 'dataset column' to a person", async () => {
    await pasteAndParse();
    expect(screenText().toLowerCase()).not.toContain("dataset");
  });

  it("4. never writes while the person is still choosing", async () => {
    await pasteAndParse();
    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it("5. choosing a column for one pasted column takes it from any other, and Skip frees it", () => {
    const { matchPasteHeaders, fillNameColumn, choosePasteColumn } = headerMatch as unknown as {
      matchPasteHeaders: typeof headerMatch.matchPasteHeaders;
      fillNameColumn: (...a: unknown[]) => Array<{ pasteHeader: string; matchedField: { field_name: string } | null }>;
      choosePasteColumn: (...a: unknown[]) => Array<{ pasteHeader: string; matchedField: { field_name: string } | null }>;
    };
    const rows = [
      { Patient: "Maria Delgado", Notes: "left knee", Floor: "3" },
      { Patient: "Sean O'Brien", Notes: "ACL", Floor: "3" },
    ];
    const headers = ["Floor", "Patient", "Notes"];
    const filled = fillNameColumn(matchPasteHeaders(headers, FIELDS), FIELDS[0], rows);
    expect(filled.map((m) => m.matchedField?.field_name ?? null)).toEqual([null, "title", null]);
    const moved = choosePasteColumn(filled, "Notes", FIELDS[0]);
    expect(moved.map((m) => m.matchedField?.field_name ?? null)).toEqual([null, null, "title"]);
    const skipped = choosePasteColumn(moved, "Notes", null);
    expect(skipped.map((m) => m.matchedField?.field_name ?? null)).toEqual([null, null, null]);
  });
});
