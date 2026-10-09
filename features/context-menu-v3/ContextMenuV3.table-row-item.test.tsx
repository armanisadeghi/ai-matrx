/**
 * A right-click on a canonical table's row hands the row's DECLARED item (ALC-18 `table_row`,
 * resolved through alchemy's `itemSources`) to the menu, which makes it the click target's `item` —
 * so Actions and menu rows get the item (identity `table_id` + `row_id`) instead of re-deriving it.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NonEditableContextMenu } from "./NonEditableContextMenu";
import { createTableRowMenuDescriptor, registerTableRowContextResolver } from "./table-row-item";

const seen: Array<{ item?: unknown; extraSections?: Array<{ id: string }> }> = [];
jest.mock("next/dynamic", () => () => (props: { item?: unknown; extraSections?: Array<{ id: string }> }) => {
  seen.push({ item: props.item, extraSections: props.extraSections });
  return null;
});
jest.mock("@ai-matrx/kit/media-query", () => ({ ...jest.requireActual("@ai-matrx/kit/media-query"), useIsMobile: () => false }));
jest.mock("@ai-matrx/chat/agents/hooks/useWidgetHandle", () => ({ useOptionalWidgetHandle: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ContextMenuV3 on a table row", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    seen.length = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("passes the resolved table_row item into the menu's click target", () => {
    const unregister = registerTableRowContextResolver("tbl-1", (t) =>
      t.level === "row" && t.rowId === "r-9" ? createTableRowMenuDescriptor({ context: { content: "Priya" }, extraSections: [] }) : null,
    );
    act(() => {
      root.render(
        <NonEditableContextMenu sourceFeature="files">
          <div data-matrx-table-id="tbl-1">
            <div data-row-id="r-9">
              <span data-testid="cell">Priya Nair</span>
            </div>
            <div data-testid="outside">not a row</div>
          </div>
        </NonEditableContextMenu>,
      );
    });
    const cell = host.querySelector<HTMLElement>('[data-testid="cell"]')!;
    act(() => {
      cell.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    const last = seen[seen.length - 1];
    expect(last?.item).toMatchObject({ itemType: "table_row", identity: { table_id: "tbl-1", row_id: "r-9" }, level: "row" });
    // Raw-free: the row's raw read never leaves the resolver.
    expect(last?.item).not.toHaveProperty("readValues");
    unregister();
  });

  // THE SURFACE'S OWN ROW MENU SURVIVES ON A TABLE ROW (Files list, 2026-10-09). A surface that
  // wraps each row in its own menu with a static `extraSections` prop (Files: Preview, Rename,
  // Move…, Move to Trash) lost every one of them once the row became a canonical table row: the
  // table's row sections replaced the prop instead of joining it. RED before the fix.
  it("joins a menu's own static extraSections with the table row's sections", () => {
    const unregister = registerTableRowContextResolver("tbl-2", (t) =>
      t.level === "row" && t.rowId === "r-1"
        ? createTableRowMenuDescriptor({
            context: { content: "report.pdf" },
            extraSections: [{ id: "table-row", label: "Row", anchor: "after-clipboard", items: [] }],
          })
        : null,
    );
    act(() => {
      root.render(
        <div data-matrx-table-id="tbl-2">
          <NonEditableContextMenu
            sourceFeature="files"
            extraSections={[
              {
                id: "file-actions",
                anchor: "after-clipboard",
                items: [{ kind: "item", id: "file-rename", label: "Rename", onSelect: () => undefined }],
              },
            ]}
          >
            <div data-row-id="r-1">
              <span data-testid="file-cell">report.pdf</span>
            </div>
          </NonEditableContextMenu>
        </div>,
      );
    });
    act(() => {
      host
        .querySelector<HTMLElement>('[data-testid="file-cell"]')!
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    const ids = (seen[seen.length - 1]?.extraSections ?? []).map((section) => section.id);
    expect(ids).toContain("file-actions");
    expect(ids).toContain("table-row");
    unregister();
  });
});
