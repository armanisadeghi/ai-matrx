/**
 * @jest-environment jsdom
 *
 * "SAVE TO ▸ A TABLE…" IS THE ONE SAVE (lane SAVE-AS-TABLE-EVERYWHERE, 2026-09-29).
 *
 * A rendered table's "Save to" menu carried two writes with two dialogs — "A live table" for a chat
 * artifact (lane HANDOVER's seed, its own create path) and "A data table" for everything else. Both
 * are now ONE item that opens the `saveToTable` overlay with this table's rows, and a chat artifact
 * learns which table the rows landed in (so it links itself and becomes live). RED on HEAD: the
 * menu read "A live table" / "A data table" and opened no overlay.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("../SendToWorkbookButton", () => ({ useSendToWorkbook: () => ({ pushing: false, send: jest.fn(), dialog: null }) }));
jest.mock("../SendToGoogleSheetButton", () => ({ useSendToGoogleSheet: () => ({ pushing: false, send: jest.fn() }) }));
const opened: Array<Record<string, unknown>> = [];
jest.mock("@/features/overlays/openers/saveToTable", () => ({
  useOpenSaveToTable: () => (options: Record<string, unknown>) => {
    opened.push(options);
    return { instanceId: "t", close: () => undefined };
  },
}));

import { TableSaveToMenu } from "../TableSaveToMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  opened.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function openAndRead(ui: React.ReactElement): Promise<HTMLElement[]> {
  await act(async () => root.render(ui));
  const trigger = document.querySelector('[aria-label="Save this table to…"]') as HTMLElement;
  await act(async () => {
    // jsdom has no PointerEvent; Radix opens a menu on a primary-button pointerdown.
    const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(down, "pointerType", { value: "mouse" });
    trigger.dispatchEvent(down);
  });
  return [...document.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
}

it("offers one table save first, and pressing it opens the one overlay with these rows", async () => {
  const items = await openAndRead(<TableSaveToMenu headers={["Exercise", "Sets"]} rows={[["Quad sets", "3"]]} title="Knee rehab plan" />);
  expect(items.map((i) => i.textContent?.trim())).toEqual(["A table…", "A workbook", "A Google Sheet"]);
  await act(async () => items[0]!.click());
  expect(opened).toHaveLength(1);
  expect(opened[0]!.grid).toEqual({ headers: ["Exercise", "Sets"], rows: [["Quad sets", "3"]] });
  expect(opened[0]!.title).toBe("Knee rehab plan");
});

it("a chat artifact is told which table the rows landed in", async () => {
  const onSaved = jest.fn();
  const items = await openAndRead(
    <TableSaveToMenu headers={["Exercise"]} rows={[["Quad sets"]]} resolveTitle={async () => "Four Balance Exercises"} onSaved={onSaved} />,
  );
  await act(async () => items[0]!.click());
  expect(opened[0]!.title).toBe("Four Balance Exercises");
  const handler = opened[0]!.onSaved as (e: { tableId: string; how: string }) => void;
  handler({ tableId: "7e0b9c2a-1d4f-4a36-8c5e-2b9f0a7d3c11", how: "new" });
  expect(onSaved).toHaveBeenCalledWith("7e0b9c2a-1d4f-4a36-8c5e-2b9f0a7d3c11", "new");
});
