/**
 * @jest-environment jsdom
 *
 * THE CREATE-A-TABLE IMPORT NEVER REFUSES IN BARE RED, AND NEVER LOSES ROWS
 * SILENTLY (lane REFUSAL-SWEEP, 2026-09-23).
 *
 * THE USE CASE. Rincon Plumbing & Drain's office manager pastes the service-call
 * log from the old spreadsheet to start a new table. Three calls; the store
 * writes two and reports the third as an error in the per-row envelope.
 *
 * Pre-sweep, that third row was a `console.warn` and the modal CLOSED on a table
 * missing a row the person believed was in it; a failure of the whole import was
 * `err.message` in a red box. Now both are the one refusal surface: what
 * happened, what to do, and a way out (Open the table / Keep editing / Discard).
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const bulkWrite = jest.fn();
const createTable = jest.fn();
// The modal makes the table through THE ONE BIRTH (the service's createTable, lane
// SWITCH-BACK-CARRIES) and writes its rows through the service's bulkWrite.
jest.mock("@/features/data-tables/service", () => ({
  bulkWrite: (...a: unknown[]) => bulkWrite(...a),
  createTable: (...a: unknown[]) => createTable(...a),
}));
// Modules loaded beside the modal scope the client at import time — so a stand-in that
// modules loaded beside it scope the client at import time — so a stand-in that
// answers any chain, and is never asked anything in these clauses.
jest.mock("@/utils/supabase/client", () => {
  const chain: unknown = new Proxy(function () {}, { get: () => chain, apply: () => chain });
  return { supabase: chain };
});

// The description box is the app's voice-enabled textarea, which needs the whole
// Redux store; these clauses are about refusals, so it is a plain textarea here.
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: Record<string, unknown>) => {
    const { onChange, value, id } = props as { onChange?: (e: unknown) => void; value?: string; id?: string };
    return <textarea id={id} value={value ?? ""} onChange={onChange} />;
  },
}));

import ImportTableModal from "../ImportTableModal";

const SERVICE_LOG =
  "Customer\tAddress\tCall type\tBilled\n" +
  "Takeda Property Management\t2210 Ocean View Dr\tWater heater\t1840\n" +
  "Marisol Okonkwo Property Care\t418 Calle Puebla\tDrain clearing\t325\n" +
  "Harbor Street Dental\t77 Harbor St\tBackflow test\t180\n";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  bulkWrite.mockReset();
  createTable.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

function byText(text: string): HTMLElement {
  const hit = Array.from(document.body.querySelectorAll<HTMLElement>("button")).find((b) =>
    (b.textContent ?? "").includes(text),
  );
  if (!hit) throw new Error(`no button reading "${text}"`);
  return hit;
}

async function pasteAndPreview(text: string = SERVICE_LOG) {
  const paste = document.getElementById("pasteData") as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(paste, text);
    paste.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    byText("Analyze").click();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  const name = document.getElementById("tableName") as HTMLInputElement | null;
  if (!name) return; // no preview: the paste was refused
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(name, "Rincon service calls");
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function mount(onClose = jest.fn(), onSuccess = jest.fn()) {
  await act(async () => {
    root.render(<ImportTableModal isOpen onClose={onClose} onSuccess={onSuccess} />);
  });
  // The paste tab.
  const pasteTab = Array.from(document.body.querySelectorAll<HTMLElement>('[role="tab"]')).find((t) =>
    /paste/i.test(t.textContent ?? ""),
  );
  await act(async () => {
    pasteTab?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    pasteTab?.click();
  });
  return { onClose, onSuccess };
}

describe("ImportTableModal refusals", () => {
  it("a row the store did not write is a notice with the way to the table, and the modal stays open", async () => {
    createTable.mockResolvedValue({ success: true, tableId: "3f1d2c4b-5a69-4e78-8f90-a1b2c3d4e5f6" });
    bulkWrite.mockResolvedValue({
      success: true,
      data: { table_id: "t", results: [{ id: "a" }, { id: "b" }, { error: "row refused" }] },
    });
    const { onClose, onSuccess } = await mount();
    await pasteAndPreview();
    await act(async () => {
      byText("Import 3 rows").click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const notice = document.body.querySelector('[role="alert"]');
    expect(notice?.textContent).toContain("1 of 3 rows were not written; the other 2 are in the new table.");
    expect(notice?.textContent).toContain("Open the table to see what landed");
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      byText("Open the table").click();
    });
    expect(onSuccess).toHaveBeenCalledWith("3f1d2c4b-5a69-4e78-8f90-a1b2c3d4e5f6");
    expect(onClose).toHaveBeenCalled();
  });

  it("a whole import that stopped says so with Keep editing and Discard, never the thrown text", async () => {
    createTable.mockResolvedValue({ success: true, tableId: "3f1d2c4b-5a69-4e78-8f90-a1b2c3d4e5f6" });
    bulkWrite.mockRejectedValue(new Error("TypeError: Failed to fetch at udt_bulk_write"));
    await mount();
    await pasteAndPreview();
    await act(async () => {
      byText("Import 3 rows").click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const notice = document.body.querySelector('[role="alert"]') as HTMLElement;
    const read = notice.cloneNode(true) as HTMLElement;
    read.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    expect(read.textContent).toContain("The import stopped before it finished.");
    expect(read.textContent).not.toContain("Failed to fetch");
    expect(notice.textContent).toContain("Keep editing");
    expect(notice.textContent).toContain("Discard");
    // Keep editing hands the form back with everything still in it.
    await act(async () => {
      byText("Keep editing").click();
    });
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    expect((document.getElementById("tableName") as HTMLInputElement | null)?.value ?? "").not.toBe("");
  });

  // VERIFIER-16: a one-line file was refused as "empty", because its only line
  // was silently taken as column names.
  it("a single row with no header is one record, with the guess shown and flippable", async () => {
    await mount();
    await pasteAndPreview("Takeda Property Management\t805-555-0142\t2210 Ocean View Dr");
    expect(document.body.textContent).not.toContain("No valid data found");
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    const says = document.body.querySelector("[data-matrx-import-first-row-says]");
    expect(says?.textContent).toContain("Every row is imported, 1 in all");
    expect(byText("Import 1 row")).toBeTruthy();
    // Flip it: the same line becomes the column names of an empty table.
    const toggle = document.getElementById("firstRowIsHeader") as HTMLElement;
    await act(async () => {
      toggle.click();
    });
    expect(document.body.querySelector("[data-matrx-import-first-row-says]")?.textContent).toContain(
      "only column names, so the table will be created with these 3 columns and no rows yet",
    );
    expect(byText("Create the table")).toBeTruthy();
  });

  it("a header plus one row is one row under those names", async () => {
    await mount();
    await pasteAndPreview("Customer\tPhone\nHarbor Street Dental\t805-555-0199");
    expect(document.body.querySelector("[data-matrx-import-first-row-says]")?.textContent).toContain(
      "The first row is used as column names, and the 1 row below it are imported.",
    );
    expect(document.body.textContent).toContain("Harbor Street Dental");
    expect(byText("Import 1 row")).toBeTruthy();
  });

  it("a blank paste is the one real refusal, through the notice", async () => {
    await mount();
    await pasteAndPreview(",,,\n , , ,");
    const notice = document.body.querySelector('[role="alert"]');
    expect(notice?.textContent).toContain("every line is blank");
  });
});
