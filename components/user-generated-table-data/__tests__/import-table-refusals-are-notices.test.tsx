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

const opened: Array<Record<string, unknown>> = [];
jest.mock("@/features/overlays/openers/saveToTable", () => ({
  useOpenSaveToTable: () => (options: Record<string, unknown>) => {
    opened.push(options);
    return { instanceId: "t", close: () => undefined };
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
  opened.length = 0;
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
  // SAVE-AS-TABLE-EVERYWHERE (VERIFIER-30 #5): this modal reads the paste or file and hands the rows
  // to the ONE "Save to a table" — it makes no table of its own, so its old create/bulk-write
  // refusals now live in that screen (records-ui `SaveToTable` suites).
  it("hands the rows it read to the one Save to a table, and closes", async () => {
    const { onClose, onSuccess } = await mount();
    await pasteAndPreview();
    await act(async () => {
      byText("Continue with 3 rows").click();
    });
    expect(createTable).not.toHaveBeenCalled();
    expect(bulkWrite).not.toHaveBeenCalled();
    expect(opened).toHaveLength(1);
    const grid = opened[0]!.grid as { headers: string[]; rows: string[][] };
    expect(grid.headers).toEqual(["Customer", "Address", "Call type", "Billed"]);
    expect(grid.rows[0]).toEqual(["Takeda Property Management", "2210 Ocean View Dr", "Water heater", "1840"]);
    expect(opened[0]!.title).toBe("Rincon service calls");
    expect(onClose).toHaveBeenCalled();
    (opened[0]!.onSaved as (e: { tableId: string }) => void)({ tableId: "3f1d2c4b-5a69-4e78-8f90-a1b2c3d4e5f6" });
    expect(onSuccess).toHaveBeenCalledWith("3f1d2c4b-5a69-4e78-8f90-a1b2c3d4e5f6");
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
    expect(byText("Continue with 1 row")).toBeTruthy();
    // Flip it: the same line becomes the column names of an empty table.
    const toggle = document.getElementById("firstRowIsHeader") as HTMLElement;
    await act(async () => {
      toggle.click();
    });
    expect(document.body.querySelector("[data-matrx-import-first-row-says]")?.textContent).toContain(
      "only column names, so the table will be created with these 3 columns and no rows yet",
    );
    expect(byText("Continue with these columns")).toBeTruthy();
  });

  it("a header plus one row is one row under those names", async () => {
    await mount();
    await pasteAndPreview("Customer\tPhone\nHarbor Street Dental\t805-555-0199");
    expect(document.body.querySelector("[data-matrx-import-first-row-says]")?.textContent).toContain(
      "The first row is used as column names, and the 1 row below it are imported.",
    );
    expect(document.body.textContent).toContain("Harbor Street Dental");
    expect(byText("Continue with 1 row")).toBeTruthy();
  });

  it("a blank paste is the one real refusal, through the notice", async () => {
    await mount();
    await pasteAndPreview(",,,\n , , ,");
    const notice = document.body.querySelector('[role="alert"]');
    expect(notice?.textContent).toContain("every line is blank");
  });
});
