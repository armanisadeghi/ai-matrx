/**
 * @jest-environment jsdom
 *
 * A SAVE OF A ROW THAT IS IN TRASH IS AN EXPECTED REFUSAL, NEVER A CONSOLE ERROR
 * (Trash click-test, 2026-09-28).
 *
 * THE USE CASE. The front desk has "Front desk callback log" open in two tabs. In one tab
 * somebody archives Marcus Oyelaran's callback; in the other the row editor is still open on
 * it, and the receptionist adds "wants it emailed" and presses Save Changes. The store refuses:
 * "This row is in Trash. Restore it from Trash to edit it." (udt_upsert_row, SQLSTATE 55000).
 *
 * The editor already shows that sentence. Before this, the save ALSO called console.error, which
 * lit the Next dev overlay's red "1 Issue" and is what lib/diagnostics/globalErrorCapture files
 * as an incident — a correct refusal reported as a defect. It is now logged as information
 * through lib/errors/expectedRefusal. Any other failure still logs as an error (second clause).
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const upsertRow = jest.fn();
jest.mock("@/features/data-tables/service", () => ({
  upsertRow: (...a: unknown[]) => upsertRow(...a),
}));
jest.mock("@/features/data-tables/choice-option-nudge", () => ({ offerToAddChoiceOption: jest.fn() }));
jest.mock("@/utils/supabase/client", () => {
  const chain: unknown = new Proxy(function () {}, { get: () => chain, apply: () => chain });
  return { supabase: chain };
});
// The app's voice-enabled textarea needs the whole Redux store; this is about the save.
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: Record<string, unknown>) => {
    const { onChange, value, id } = props as { onChange?: (e: unknown) => void; value?: string; id?: string };
    return <textarea id={id} value={value ?? ""} onChange={onChange} />;
  },
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { mapPgError } from "@ai-matrx/records/core";
import EditRowModal from "../EditRowModal";

const TRASH = "This row is in Trash. Restore it from Trash to edit it.";
const FIELDS = [
  { id: "f1", field_name: "caller_name", display_name: "Caller name", data_type: "string", field_order: 0, is_required: false },
  { id: "f2", field_name: "reason", display_name: "Reason", data_type: "string", field_order: 1, is_required: false },
];
const ROW = { caller_name: "Marcus Oyelaran", reason: "Question about the insurance estimate" };

let container: HTMLDivElement;
let root: Root;
let errorSpy: jest.SpyInstance;
let infoSpy: jest.SpyInstance;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  upsertRow.mockReset();
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  errorSpy.mockRestore();
  infoSpy.mockRestore();
});

async function saveOnce() {
  await act(async () => {
    root.render(
      <EditRowModal
        tableId="67f4e437-0511-4a79-8a93-1b9ea9261003"
        rowId="fc91952b-0555-4f5a-9476-f888f0cd30de"
        rowData={ROW}
        fields={FIELDS}
        isOpen
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
  });
  const save = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
    (b.textContent ?? "").includes("Save Changes"),
  );
  if (!save) throw new Error("no Save Changes button");
  await act(async () => {
    save.click();
  });
}

/** console.error calls that are about this save (React's own act/DOM noise is not the claim). */
function saveErrors(): unknown[][] {
  return errorSpy.mock.calls.filter((args: unknown[]) => args.some((a: unknown) => String(a).includes("updating row") || String(a).includes("in Trash")));
}

it("a refused save of a row in Trash shows the sentence and logs no console.error", async () => {
  upsertRow.mockResolvedValue({
    success: false,
    error: TRASH,
    refusal: { code: "internal", message: TRASH, sqlstate: "55000", hint: "Open Trash, restore the row, then edit it." },
  });
  await saveOnce();
  expect(document.body.textContent).toContain(TRASH);
  expect(saveErrors()).toEqual([]);
  expect(infoSpy).toHaveBeenCalled();
});

it("the 409 shape (code row_in_trash, udt_row_in_trash_refusal_is_a_conflict.sql) is the same expected refusal", async () => {
  // What supabase-js hands the service for PostgREST's custom 409: the JSON MESSAGE's fields.
  const pgError = { code: "row_in_trash", message: TRASH, details: null, hint: "Open Trash, restore the row, then edit it." };
  upsertRow.mockResolvedValue({
    success: false,
    error: TRASH,
    refusal: mapPgError(pgError as never, "the older data tables"),
  });
  await saveOnce();
  expect(document.body.textContent).toContain(TRASH);
  expect(saveErrors()).toEqual([]);
  expect(infoSpy).toHaveBeenCalled();
});

it("any other refused save still logs a console.error", async () => {
  upsertRow.mockResolvedValue({
    success: false,
    error: "permission denied for table udt_dataset_rows",
    refusal: { code: "forbidden", message: "permission denied for table udt_dataset_rows", sqlstate: "42501" },
  });
  await saveOnce();
  expect(saveErrors().length).toBeGreaterThan(0);
});
