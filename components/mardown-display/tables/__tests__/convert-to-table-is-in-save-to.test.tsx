/**
 * @jest-environment jsdom
 *
 * CONVERT TO TABLE IS IN "SAVE TO" (lane HANDOVER, 2026-09-28).
 *
 * Cedar Ridge Physical Therapy asked the chat for a table of home exercises. The one write she came
 * for — make it a live table in the clinic's data — was a bare table icon beside a labelled "Save
 * to" menu that offered only a workbook and a Google Sheet. It is now the menu's first item.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("../SendToWorkbookButton", () => ({ useSendToWorkbook: () => ({ pushing: false, send: jest.fn(), dialog: null }) }));
jest.mock("../SendToGoogleSheetButton", () => ({ useSendToGoogleSheet: () => ({ pushing: false, send: jest.fn() }) }));

import { TableSaveToMenu } from "../TableSaveToMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
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

it("a chat table's Save to offers a live table first, and pressing it converts", async () => {
  const onClick = jest.fn();
  const items = await openAndRead(
    <TableSaveToMenu
      headers={["Exercise", "Sets"]}
      rows={[["Quad sets", "3"]]}
      convertToTable={{ onClick }}
      onSaveAsDataTable={() => {}}
      onOpenSavedTable={() => {}}
    />,
  );
  expect(items.map((i) => i.textContent?.trim())).toEqual(["A live table", "A workbook", "A Google Sheet"]);
  await act(async () => items[0]!.click());
  expect(onClick).toHaveBeenCalledTimes(1);
});

it("a table that is not a chat artifact keeps its data-table save", async () => {
  const items = await openAndRead(
    <TableSaveToMenu headers={["Exercise"]} rows={[["Quad sets"]]} onSaveAsDataTable={() => {}} onOpenSavedTable={() => {}} />,
  );
  expect(items.map((i) => i.textContent?.trim())).toEqual(["A data table", "A workbook", "A Google Sheet"]);
});
