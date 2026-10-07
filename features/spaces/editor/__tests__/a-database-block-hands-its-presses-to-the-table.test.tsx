/**
 * @jest-environment jsdom
 */
// A DATABASE BLOCK HANDS ITS PRESSES AND KEYS TO THE TABLE (lane CELL-EDITORS, 2026-10-06).
//
// In a Spaces page, the table in a database block selected nothing on one click: the block stopped
// mousedown and keydown natively on its own element, so React — listening above the editor — never
// delivered them to the grid. Enter, a second click and typing did nothing; only a double-click opened
// a cell. The block now stops nothing, and the page editor (ProseMirror) is told those events are not
// its own. Fails on the old host (React never sees the press); passes on this one.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DATABASE_EVENT_CLAIMS, DatabaseHost, insideDatabaseBlock } from "../database-host";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  host = null;
});

function mount(seen: string[]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <div onMouseDown={() => seen.push("mousedown")} onKeyDown={(e) => seen.push(`keydown ${e.key}`)}>
        <DatabaseHost>
          <span data-testid="cell">Scheduled</span>
        </DatabaseHost>
        <p data-testid="outside">A paragraph of the page</p>
      </div>,
    ),
  );
  return host;
}

describe("a database block in a page", () => {
  it("lets a press and a key on its table reach the table's React handlers", () => {
    const seen: string[] = [];
    const el = mount(seen);
    const cell = el.querySelector('[data-testid="cell"]')!;
    act(() => {
      cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      cell.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });
    expect(seen).toEqual(["mousedown", "keydown Enter"]);
  });

  it("tells the page editor that every press, key and clipboard event inside it is not the editor's", () => {
    const el = mount([]);
    const cell = el.querySelector('[data-testid="cell"]')!;
    const outside = el.querySelector('[data-testid="outside"]')!;
    for (const [kind, claim] of Object.entries(DATABASE_EVENT_CLAIMS)) {
      const inside = new Event(kind, { bubbles: true });
      Object.defineProperty(inside, "target", { value: cell });
      const beside = new Event(kind, { bubbles: true });
      Object.defineProperty(beside, "target", { value: outside });
      expect([kind, claim(null, inside)]).toEqual([kind, true]);
      expect([kind, claim(null, beside)]).toEqual([kind, false]);
    }
    expect(Object.keys(DATABASE_EVENT_CLAIMS)).toEqual(expect.arrayContaining(["mousedown", "keydown", "paste", "copy", "cut"]));
    const press = new MouseEvent("mousedown");
    Object.defineProperty(press, "target", { value: cell });
    expect(insideDatabaseBlock(press)).toBe(true);
  });
});
