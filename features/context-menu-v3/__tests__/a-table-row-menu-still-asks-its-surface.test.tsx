/**
 * GUARD — A TABLE ROW'S MENU STILL ASKS THE SURFACE WHICH RECORD THE ROW IS
 * (CHAIR-REACH, 2026-10-03).
 *
 * Every canonical table registers a default row descriptor (`__entity: null`). The shell read
 * `rowMenu?.context ?? resolveContextOnOpen(target)`, so on a table row the surface's resolver was
 * never called: /crm rows had no Attach To, no Share, no "Link a record…", and none of the row's
 * own doors (they are built from the state that resolver sets).
 *
 * Breaks each test names:
 * - the surface's entity dropped when the table's descriptor names none → "entity" red.
 * - a descriptor's own entity or values overwritten by the surface → "descriptor stands" red.
 * - the shell not calling the surface's resolver on a table row, or not handing the menu the
 *   surface's own row sections → "the shell" red (this is the wiring, not the helper).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NonEditableContextMenu } from "../NonEditableContextMenu";
import {
  createDefaultTableRowMenuDescriptor,
  registerTableRowContextResolver,
} from "../table-row-item";
import { joinRowAndSurfaceContext } from "../utils/per-row-entity";
import { CONTEXT_MENU_ENTITY_KEY, type ContextMenuEntityRef, type ContextMenuExtraSection } from "../types";

const seen: Array<{ entity: unknown; sections: string[] }> = [];
jest.mock("next/dynamic", () => () => (props: { entity?: unknown; extraSections?: Array<{ id: string }> }) => {
  seen.push({ entity: props.entity ?? null, sections: (props.extraSections ?? []).map((s) => s.id) });
  return null;
});
jest.mock("@ai-matrx/kit/media-query", () => ({ ...jest.requireActual("@ai-matrx/kit/media-query"), useIsMobile: () => false }));
jest.mock("@ai-matrx/chat/agents/hooks/useWidgetHandle", () => ({ useOptionalWidgetHandle: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PARTY: ContextMenuEntityRef = { type: "party", id: "3f0c1c62-0f6f-4f5e-9d0e-7b1f6f1f2a10", title: "Cedar Ridge Dental" };

describe("joinRowAndSurfaceContext", () => {
  it("entity: the surface names the record when the table's descriptor names none", () => {
    const joined = joinRowAndSurfaceContext(
      { content: "Cedar Ridge Dental", context: { id: PARTY.id }, [CONTEXT_MENU_ENTITY_KEY]: null },
      { content: "Cedar Ridge Dental\nCompany", [CONTEXT_MENU_ENTITY_KEY]: PARTY },
    );
    expect(joined?.[CONTEXT_MENU_ENTITY_KEY]).toEqual(PARTY);
  });

  it("descriptor stands: its values and its own entity are never overwritten; surface-only keys are kept", () => {
    const own: ContextMenuEntityRef = { type: "crm_deal", id: "9a1b2c3d-0000-4000-8000-000000000001", title: "Cedar Ridge renewal" };
    const joined = joinRowAndSurfaceContext(
      { content: "the clicked cell", [CONTEXT_MENU_ENTITY_KEY]: own },
      { content: "the surface's words", stage: "Negotiation", [CONTEXT_MENU_ENTITY_KEY]: PARTY },
    );
    expect(joined).toMatchObject({ content: "the clicked cell", stage: "Negotiation" });
    expect(joined?.[CONTEXT_MENU_ENTITY_KEY]).toEqual(own);
  });

  it("one owner alone is returned as it is, and the surface saying nothing leaves the descriptor's silence", () => {
    expect(joinRowAndSurfaceContext(null, { content: "x" })).toEqual({ content: "x" });
    const row = { content: "y", [CONTEXT_MENU_ENTITY_KEY]: null };
    expect(joinRowAndSurfaceContext(row, null)).toEqual(row);
    expect(joinRowAndSurfaceContext(row, { content: "z" })?.[CONTEXT_MENU_ENTITY_KEY]).toBeNull();
    expect(joinRowAndSurfaceContext(null, null)).toBeNull();
  });
});

describe("the shell, on a row of a canonical table", () => {
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

  it("asks the surface for the row's record and draws the surface's own row sections", () => {
    const asked: string[] = [];
    const rowSections: ContextMenuExtraSection[] = [
      { id: "crm-row", label: "Party", items: [{ kind: "item", id: "open-party", label: "Open", onSelect: () => {} }] },
    ];
    const unregister = registerTableRowContextResolver("crm-list", (target) =>
      createDefaultTableRowMenuDescriptor({
        ...(target as { tableId: string; level: "row"; rowId: string }),
        row: { id: PARTY.id, display_name: PARTY.title },
        controls: {},
      } as never),
    );
    act(() => {
      root.render(
        <NonEditableContextMenu
          sourceFeature="crm"
          resolveContextOnOpen={(el) => {
            asked.push(el?.closest("[data-row-id]")?.getAttribute("data-row-id") ?? "");
            return { content: PARTY.title, [CONTEXT_MENU_ENTITY_KEY]: PARTY };
          }}
          extraSections={rowSections}
        >
          <div data-matrx-table-id="crm-list">
            <div data-row-id={PARTY.id}>
              <span data-testid="cell">{PARTY.title}</span>
            </div>
          </div>
        </NonEditableContextMenu>,
      );
    });
    const cell = host.querySelector<HTMLElement>('[data-testid="cell"]');
    if (!cell) throw new Error("the row did not render");
    act(() => {
      cell.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    unregister();

    expect(asked).toContain(PARTY.id);
    const last = seen[seen.length - 1];
    expect(last?.entity).toEqual(PARTY);
    expect(last?.sections).toContain("crm-row");
  });
});
