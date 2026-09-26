/**
 * TYPING ON A SELECTED CELL STARTS EDITING IT — whatever way the text arrives.
 *
 * Spreadsheet contract (Google Sheets, Airtable, Excel): select a cell with one
 * click, type, press Enter — the typed text is saved. The grid used to learn
 * about typing ONLY from `keydown` on a focused, NON-editable <div>. Text that
 * reaches the page without a single-character keydown — an IME composition
 * (key "Process"), an Option / AltGr character (`altKey` is refused as a
 * shortcut), dictation, the browser's own insertText — landed nowhere: the grid
 * never opened an editor, then the Enter opened one on the OLD value and saved
 * nothing (found live on /data 2026-09-25, "Testville" after one click).
 *
 * These tests drive the grid the way a browser does: text goes into whatever
 * element holds focus, and only if that element can take text.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useGridSelection, type GridSelectionApi } from "../useGridSelection";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has neither; the hook uses both to keep the selected cell on screen.
if (typeof globalThis.CSS === "undefined") {
  (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = { escape: (s) => s };
}
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

const ROW_IDS = ["r1", "r2"];
const FIELD_NAMES = ["name", "city"];

let latest!: GridSelectionApi;

/** The grid shell exactly as `UserTableViewer` mounts it. */
function Harness({ editable = true }: { editable?: boolean }) {
  const grid = useGridSelection({
    rowIds: ROW_IDS,
    fieldNames: FIELD_NAMES,
    editable,
    getCellText: () => "",
    onClearCells: () => {},
    onPasteText: () => {},
    onUndo: () => {},
    onRedo: () => {},
  });
  latest = grid;
  return (
    <div
      ref={grid.containerRef}
      tabIndex={0}
      role="grid"
      onKeyDown={grid.onKeyDown}
      onFocus={grid.onGridFocus}
      {...grid.clipboardHandlers}
    >
      <textarea {...grid.typeCatcherProps} />
      <div data-cell="r1::city">Moscow</div>
    </div>
  );
}

let root: Root;
let host: HTMLDivElement;

async function mount(props: { editable?: boolean } = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(<Harness {...props} />);
  });
}

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

/** One click on a cell: the viewer's `onSelect` does exactly these two things. */
async function clickCell(rowId: string, fieldName: string) {
  await act(async () => {
    latest.select({ rowId, fieldName });
    latest.refocusGrid();
  });
}

function isTextEntry(el: Element | null): el is HTMLTextAreaElement | HTMLInputElement {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
}

/**
 * What the browser does with text that has no keydown of its own: it goes into
 * the focused element if that element takes text, and nowhere otherwise.
 */
async function insertTextLikeABrowser(text: string) {
  await act(async () => {
    const el = document.activeElement;
    if (!isTextEntry(el)) return;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!;
    setter.call(el, el.value + text);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
  });
}

async function keyDown(key: string) {
  let prevented = false;
  await act(async () => {
    const el = document.activeElement ?? document.body;
    const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    prevented = ev.defaultPrevented;
  });
  return prevented;
}

describe("useGridSelection — type to edit", () => {
  it("text that arrives without a keydown opens the selected cell's editor, seeded with it", async () => {
    await mount();
    await clickCell("r1", "city");

    await insertTextLikeABrowser("Testville");

    expect(latest.editing).toEqual({ rowId: "r1", fieldName: "city" });
    expect(latest.editSeed).toBe("Testville");
  });

  it("a plain typed key still opens the editor from keydown, and the character is not typed twice", async () => {
    await mount();
    await clickCell("r1", "city");

    const prevented = await keyDown("T");

    expect(prevented).toBe(true);
    expect(latest.editing).toEqual({ rowId: "r1", fieldName: "city" });
    expect(latest.editSeed).toBe("T");
  });

  it("an IME composition opens the editor once, with the composed text", async () => {
    await mount();
    await clickCell("r2", "name");
    const el = document.activeElement!;
    expect(isTextEntry(el)).toBe(true);

    await act(async () => {
      el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    });
    await insertTextLikeABrowser("toukyou");
    expect(latest.editing).toBeNull();

    await act(async () => {
      (el as HTMLTextAreaElement).value = "東京";
      el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "東京" }));
    });

    expect(latest.editing).toEqual({ rowId: "r2", fieldName: "name" });
    expect(latest.editSeed).toBe("東京");
  });

  it("Arrow keys still move the selection while the grid holds focus", async () => {
    await mount();
    await clickCell("r1", "name");

    await keyDown("ArrowRight");

    expect(latest.selected).toEqual({ rowId: "r1", fieldName: "city" });
    expect(latest.editing).toBeNull();
  });

  it("a space alone never opens an editor, and neither does text on a read-only grid", async () => {
    await mount();
    await clickCell("r1", "city");
    await insertTextLikeABrowser(" ");
    expect(latest.editing).toBeNull();
    await act(async () => root.unmount());
    host.remove();

    await mount({ editable: false });
    await clickCell("r1", "city");
    await insertTextLikeABrowser("Testville");
    expect(latest.editing).toBeNull();
  });
});
