/**
 * THE SHEET DRAWS A WITHHELD CELL WITH RECORDS-UI'S ONE HELPER (lane POST-PUBLISH-FE, VERIFIER-18 H1).
 *
 * The record-store seam hands each row its withheld cells (proven with a masked Budget in
 * `data-source/__tests__/the-sheet-reads-the-table-the-way-the-grid-does.test.ts`). This guard
 * holds the Sheet's half, in `UserTableViewer`: (1) the rows it keeps from the seam carry
 * `withheld` (its row normaliser used to rebuild each row from id/data/timestamps and would drop
 * it), and (2) a cell asks `withheldCellOf` and draws `SheetWithheldCell` before any other
 * rendering, so a withheld value never falls through to "—". The helper itself is proven here
 * too: it draws records-ui's word and the store's sentence.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { WITHHELD_WORD } from "@ai-matrx/records-ui";

import { SheetWithheldCell, withheldCellOf, withheldCells } from "../withheld-cells";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VIEWER = readFileSync(
  join(__dirname, "..", "..", "..", "components", "user-generated-table-data", "UserTableViewer.tsx"),
  "utf8",
);

const BUDGET = { id: "6c1f0a2b-1111-4a00-8000-000000000002", key: "budget", label: "Budget", type: "number" };
const NOTICE = { reason: "confidential", needs: "Editor", or: null };

describe("the Sheet · a withheld Budget reads Withheld, with the store's reason", () => {
  it("the viewer keeps each row's withheld cells", () => {
    const normaliser = VIEWER.slice(VIEWER.indexOf("function asTableDataRows"), VIEWER.indexOf("function asTableFields"));
    expect(normaliser).toMatch(/withheld/);
  });

  it("a cell asks for its withheld notice before it draws anything else", () => {
    expect(VIEWER).toMatch(/const withheldCell = withheldCellOf\(row, field\.field_name\)/);
    expect(VIEWER).toMatch(/const display = withheldCell \? \(\s*<SheetWithheldCell cell=\{withheldCell\} \/>/);
  });

  it("draws records-ui's word and the store's sentence, never a dash", async () => {
    const cells = withheldCells({ budget: NOTICE }, [BUDGET as never]);
    const cell = withheldCellOf({ id: "r-garage", data: { budget: null }, withheld: cells }, "budget");
    expect(cell).not.toBeNull();
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(createElement(SheetWithheldCell, { cell: cell! })));
    expect(host.textContent).toBe(WITHHELD_WORD);
    expect(host.textContent).not.toBe("—");
    const title = host.querySelector("[data-records-withheld]")?.getAttribute("title") ?? "";
    expect(title).toMatch(/Budget/);
    expect(title).toMatch(/Editor/);
    await act(async () => root.unmount());
  });
});
