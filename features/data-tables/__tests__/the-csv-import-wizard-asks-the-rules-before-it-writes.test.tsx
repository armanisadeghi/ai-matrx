/**
 * THE CSV IMPORT WIZARD ASKS THE COLUMN'S RULES BEFORE IT WRITES.
 *
 * The red twin for lane REFUSAL-SWEEP item 2a (2026-09-23), covering the one
 * surface lane VALIDATION-REFUSAL named and did not build: the wizard that maps
 * a pasted/CSV file's columns onto an EXISTING table's columns and inserts the
 * rows.
 *
 * WHAT IT PINS, and what it looked like before:
 *   · The wizard never read `validation_rules` at all — its own field type did
 *     not even declare the key. Every mapped row went to `bulkWrite` and the
 *     STORE refused them one at a time, after the round trip, as one destructive
 *     toast carrying the envelope's sentence and naming no column.
 *   · There was therefore no way to see WHICH column refused, WHAT its rule
 *     wants, or HOW MANY rows break it — and no way to drop the offending
 *     column, because the mapping was automatic and fixed.
 *
 * RED PROOF (recorded 2026-09-23 by restoring the pre-fix bytes of
 * `PasteRowsDialog.tsx` in place and putting them back in the same command):
 * clauses 1–6 fail — `expected a refusal on screen before the write, found none`
 * and `bulkWrite was called with all 4 rows`.
 *
 * THE USE CASE (owner law 2026-09-21, no fake test data): Rincon Plumbing &
 * Drain, a residential + light-commercial plumbing contractor in Ventura County.
 * Their dispatcher keeps the week's open work orders in a spreadsheet and pastes
 * the backlog into the dispatch board every Monday. The board's Work order
 * column declares the shop's own numbering — `WO-####` — because the field techs
 * read it off the truck tablet; two of the pasted rows carry the old
 * hyphen-less numbers from the previous office system.
 *
 * The judge is the REAL `validateCellValue`; the notice is the REAL
 * `RefusalNotice` from the published `@ai-matrx/records-ui`. The only double is
 * `bulkWrite`, because a refused row must never reach it and that is one of the
 * clauses.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const bulkWrite = jest.fn();
jest.mock("@/features/data-tables/service", () => ({
  bulkWrite: (...args: unknown[]) => bulkWrite(...args),
}));

const toasted = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => toasted(...args),
}));

import PasteRowsDialog from "@/components/user-generated-table-data/PasteRowsDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  bulkWrite.mockReset();
  bulkWrite.mockResolvedValue({ data: { results: [] } });
  toasted.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Rincon's dispatch board, as the table config row carries it. */
const DISPATCH_BOARD_FIELDS = [
  {
    id: "f1",
    field_name: "work_order",
    display_name: "Work order",
    data_type: "string",
    is_required: true,
    validation_rules: {
      pattern: "^WO-[0-9]{4}$",
      patternHint: "WO-4473",
      maxLength: 7,
    },
  },
  {
    id: "f2",
    field_name: "customer",
    display_name: "Customer",
    data_type: "string",
    is_required: false,
  },
  {
    id: "f3",
    field_name: "service_address",
    display_name: "Service address",
    data_type: "string",
    is_required: false,
  },
  {
    id: "f4",
    field_name: "problem",
    display_name: "Reported problem",
    data_type: "string",
    is_required: false,
  },
];

/**
 * Monday's backlog off the dispatcher's spreadsheet. Two rows still carry the
 * numbering the old office system used, before the shop standardised on WO-####.
 */
const MONDAY_BACKLOG = [
  "Work order,Customer,Service address,Reported problem",
  "WO-4471,Delgado Property Mgmt,412 N Ventura Ave Unit B,Water heater not holding temperature",
  "4472,Casa Verde Apartments,1180 Terrace Dr,Main line backing up into downstairs unit",
  "WO-4473,Hector Maldonado,2237 Poli St,Kitchen sink draining slowly after disposal install",
  "WO 4474,Ventura Coast Dental,905 S Seaward Ave #4,Leak under the sterilizer room sink",
].join("\n");

function renderWizard(fields: unknown[] = DISPATCH_BOARD_FIELDS) {
  act(() => {
    root.render(
      <PasteRowsDialog
        tableId="rincon-dispatch-board"
        fields={fields as never}
        isOpen
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
  });
}

function typeInto(selector: string, text: string) {
  const el = document.querySelector(selector) as HTMLTextAreaElement;
  if (!el) throw new Error(`no element for ${selector}`);
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function clickByText(fragment: string) {
  const button = Array.from(document.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes(fragment),
  );
  if (!button) {
    throw new Error(
      `no button whose label contains "${fragment}" — found: ${Array.from(
        document.querySelectorAll("button"),
      )
        .map((b) => JSON.stringify(b.textContent))
        .join(", ")}`,
    );
  }
  act(() => (button as HTMLButtonElement).click());
  return button as HTMLButtonElement;
}

/** Paste the backlog and get to the mapping / preview step. */
function pasteAndPreview(text: string = MONDAY_BACKLOG) {
  typeInto("#pasteData", text);
  clickByText("Parse");
}

function refusalPanelText(): string {
  const panel = document.querySelector("[data-matrx-import-refusals]");
  return (panel?.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("Rincon Plumbing & Drain pastes Monday's work-order backlog", () => {
  it("1 · the refusal is on screen BEFORE anything is written, naming the column", () => {
    renderWizard();
    pasteAndPreview();

    expect(bulkWrite).not.toHaveBeenCalled();
    const said = refusalPanelText();
    expect(said).not.toEqual("");
    expect(said).toContain("Work order");
  });

  it("2 · it says what the rule wants and how many of the pasted rows fail it", () => {
    renderWizard();
    pasteAndPreview();

    const said = refusalPanelText();
    // The column's own rules, verbatim, beside the sentence — the half the
    // refusal formatter's machine-identity filter would have eaten, because
    // `WO-4473` is exactly the shape of a contract row id.
    expect(said).toContain("WO-4473");
    expect(said).toContain("At most 7 characters");
    // Two of the four rows carry the old numbering.
    expect(said).toContain("2 of the 4 rows");
  });

  it("3 · it says what to do, in words true of THIS screen", () => {
    renderWizard();
    pasteAndPreview();

    expect(refusalPanelText()).toContain(
      "Fix the column this is mapped to, leave the column out, or import only the rows that pass",
    );
  });

  it("4 · the import button is honest about what it will do — never its old label", () => {
    renderWizard();
    pasteAndPreview();

    const confirm = document.querySelector(
      "[data-matrx-import-confirm]",
    ) as HTMLButtonElement | null;
    expect(confirm).not.toBeNull();
    expect(confirm!.textContent).toContain("2 Rows That Pass");
  });

  it("5 · proceeding writes ONLY the rows that pass, and never the refused ones", async () => {
    renderWizard();
    pasteAndPreview();
    clickByText("Rows That Pass");
    await act(async () => {
      await Promise.resolve();
    });

    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const operations = bulkWrite.mock.calls[0][0].operations as {
      data: Record<string, unknown>;
    }[];
    expect(operations).toHaveLength(2);
    expect(operations.map((o) => o.data.work_order)).toEqual([
      "WO-4471",
      "WO-4473",
    ]);
  });

  it("6 · the person can drop the refusing column instead, and then every row goes", async () => {
    renderWizard();
    pasteAndPreview();

    const drop = document.querySelector(
      "[data-matrx-import-drop-column='work_order']",
    ) as HTMLButtonElement | null;
    expect(drop).not.toBeNull();
    act(() => drop!.click());

    expect(refusalPanelText()).toEqual("");
    clickByText("Paste 4 Rows");
    await act(async () => {
      await Promise.resolve();
    });

    const operations = bulkWrite.mock.calls[0][0].operations as {
      data: Record<string, unknown>;
    }[];
    expect(operations).toHaveLength(4);
    expect(operations.every((o) => !("work_order" in o.data))).toBe(true);
  });

  it("7 · a column whose rules cannot be read is SAID so, and blocks its own import", () => {
    renderWizard([
      {
        ...DISPATCH_BOARD_FIELDS[0],
        // What a half-migrated column actually looks like: something is stored,
        // and the rule reader can make no rule out of it.
        validation_rules: { requiredShape: "WO-####", enforcedBy: "dispatch" },
      },
      ...DISPATCH_BOARD_FIELDS.slice(1),
    ]);
    pasteAndPreview();

    const said = refusalPanelText();
    expect(said).toContain("could not read");
    expect(bulkWrite).not.toHaveBeenCalled();

    const confirm = document.querySelector(
      "[data-matrx-import-confirm]",
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    // Disabled is only honest when the screen says why and what to do about it.
    const reason = document.querySelector(
      "[data-matrx-import-blocked-reason]",
    );
    expect((reason?.textContent ?? "")).toContain("Work order");
    expect((reason?.textContent ?? "")).toContain("Leave that column out");
  });

  it("8 · a backlog that breaks nothing still imports whole, with no notice at all", async () => {
    renderWizard();
    pasteAndPreview(
      [
        "Work order,Customer,Service address,Reported problem",
        "WO-4475,Delgado Property Mgmt,412 N Ventura Ave Unit B,Recirculation pump seized",
        "WO-4476,Hector Maldonado,2237 Poli St,Angle stop weeping under the vanity",
      ].join("\n"),
    );

    expect(refusalPanelText()).toEqual("");
    clickByText("Paste 2 Rows");
    await act(async () => {
      await Promise.resolve();
    });
    expect(bulkWrite).toHaveBeenCalledTimes(1);
    expect(bulkWrite.mock.calls[0][0].operations).toHaveLength(2);
  });
});
