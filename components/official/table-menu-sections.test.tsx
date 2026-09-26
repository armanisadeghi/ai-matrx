import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MATRX_TABLE_MENU_ICON_NAMES } from "@ai-matrx/design-system/data-table/menu-targets";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import {
  createTableRowMenuDescriptor,
  registerTableRowContextResolver,
} from "@/features/context-menu-v3/table-row-context-registry";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { TABLE_MENU_ICONS, toContextMenuExtraSections } from "./table-menu-sections";

// The menu body is lazy; stand it in with one that prints the sections it was
// handed, so the test reads exactly what the menu would draw.
jest.mock("next/dynamic", () => () =>
  function MenuContentStandIn(props: { extraSections?: ContextMenuExtraSection[] }) {
    return (
      <div
        data-testid="menu-content"
        data-sections={(props.extraSections ?? []).map((s) => s.id).join(",")}
      />
    );
  },
);
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/features/agents/hooks/useWidgetHandle", () => ({
  useOptionalWidgetHandle: () => null,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("the canonical table's neutral sections in the app menu", () => {
  it("has a glyph for every icon name the package can send", () => {
    for (const name of MATRX_TABLE_MENU_ICON_NAMES) {
      expect(TABLE_MENU_ICONS[name]).toBeTruthy();
    }
  });

  it("maps title, icon, shortcut, disabled-with-reason, destructive and submenu", () => {
    const copy = jest.fn();
    const blocked = jest.fn();
    const [section] = toContextMenuExtraSections([
      {
        id: "cell",
        title: "Cell",
        primary: true,
        items: [
          { id: "copy", label: "Copy 3 cells", icon: "copy", shortcut: "⌘C", onSelect: copy },
          { id: "cut", label: "Cut", icon: "scissors", disabledReason: "View-only table", onSelect: blocked },
          { id: "clear", label: "Clear", destructive: true, onSelect: () => {} },
          { id: "hl", label: "Highlight", icon: "paintbrush", submenu: [{ id: "hl-red", label: "Red", onSelect: () => {} }] },
        ],
      },
      { id: "empty", title: "Nothing", items: [] },
    ]);
    expect(section).toMatchObject({ id: "table-cell", label: "Cell", primary: true, anchor: "after-clipboard" });
    const [c, cut, clear, hl] = section!.items;
    expect(c).toMatchObject({ kind: "item", label: "Copy 3 cells", hint: "⌘C", icon: TABLE_MENU_ICONS.copy });
    expect(cut).toMatchObject({ kind: "item", disabled: true, description: "View-only table" });
    if (cut?.kind !== "item") throw new Error("not an item");
    cut.onSelect();
    expect(blocked).not.toHaveBeenCalled();
    expect(clear).toMatchObject({ destructive: true });
    expect(hl).toMatchObject({ kind: "submenu", children: [{ kind: "item", label: "Red" }] });
    if (c?.kind !== "item") throw new Error("not an item");
    c.onSelect();
    expect(copy).toHaveBeenCalledTimes(1);
  });

  describe("resolveExtraSectionsOnOpen", () => {
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

    function drawnSections(): string | null {
      return document.body.querySelector('[data-testid="menu-content"]')?.getAttribute("data-sections") ?? null;
    }

    it("is asked with the clicked element and draws its answer BESIDE a table row's own sections", () => {
      const rowSection: ContextMenuExtraSection = {
        id: "table-row",
        label: "Row",
        items: [{ kind: "item", id: "edit", label: "Edit row", onSelect: () => {} }],
      };
      const unregister = registerTableRowContextResolver("t-1", () =>
        createTableRowMenuDescriptor({ context: { content: "row" }, extraSections: [rowSection] }),
      );
      const asked: Array<HTMLElement | null> = [];
      act(() => {
        root.render(
          <NonEditableContextMenu
            sourceFeature="system"
            enableFloatingIcon={false}
            resolveExtraSectionsOnOpen={(target) => {
              asked.push(target);
              return [{ id: "table-cell", label: "Cell", items: [{ kind: "item", id: "cut", label: "Cut", onSelect: () => {} }] }];
            }}
          >
            <div data-matrx-table-id="t-1">
              <div data-row-id="r-1">
                <span data-testid="cell">value</span>
              </div>
            </div>
          </NonEditableContextMenu>,
        );
      });
      const cell = host.querySelector<HTMLElement>('[data-testid="cell"]')!;
      act(() => {
        cell.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      });
      expect(asked).toContain(cell);
      expect(drawnSections()).toBe("table-row,table-cell");
      unregister();
    });

    it("leaves a menu without it exactly as it was", () => {
      act(() => {
        root.render(
          <NonEditableContextMenu
            sourceFeature="system"
            enableFloatingIcon={false}
            extraSections={[{ id: "page", label: "Page", items: [{ kind: "item", id: "p", label: "P", onSelect: () => {} }] }]}
          >
            <span data-testid="plain">plain</span>
          </NonEditableContextMenu>,
        );
      });
      act(() => {
        host.querySelector('[data-testid="plain"]')!.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
        );
      });
      expect(drawnSections()).toBe("page");
    });
  });
});
