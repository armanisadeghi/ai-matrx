/**
 * A RECORD'S ⋯ AND A RIGHT-CLICK ON ITS CONTENT ARE ONE TARGET (R26, ALC-15 round 5).
 *
 * MEASURED on /notes (Read mode): the tab's ⋯ drew 27 rows (adds Tab, Attach To, Share) and a
 * right-click on the note's content drew 25 (adds Clean up, Help with this…) — two menus for one
 * note. The tab strip holds the note's record rows but the content is drawn elsewhere, so:
 *   · the content root is marked `data-record-menu="<key>"` and the record rows are registered under
 *     that key — every menu opened inside that root carries them (and the record's entity);
 *   · the ⋯ opens the content's OWN menu (`openRecordMenu`), not a second one on the tab.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NonEditableContextMenu } from "../NonEditableContextMenu";
import { RECORD_MENU_ATTR, openRecordMenu, registerRecordMenu } from "../record-menu-registry";

const seen: Array<{ source: string; sections: string[]; entity: string | null }> = [];
jest.mock("next/dynamic", () => () => (props: { sourceFeature: string; extraSections?: Array<{ id: string }>; entity?: { id: string } | null }) => {
  seen.push({
    source: props.sourceFeature,
    sections: (props.extraSections ?? []).map((s) => s.id),
    entity: props.entity?.id ?? null,
  });
  const ReactModule = require("react");
  return ReactModule.createElement("div", { "data-testid": "alchemy-menu", "data-source": props.sourceFeature });
});
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/features/agents/hooks/useWidgetHandle", () => ({ useOptionalWidgetHandle: () => null }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = "note-tab:inst-1:note-1";
const tabRows = {
  entity: { type: "note" as const, id: "note-1", title: "Supplier call follow-ups", resourceType: "note" as const },
  extraSections: [{ id: "note-tab", label: "Tab", items: [{ kind: "item" as const, id: "duplicate", label: "Duplicate note", onSelect: () => {} }] }],
};

let host: HTMLDivElement;
let root: Root;
let unregister: () => void = () => {};
beforeEach(() => {
  seen.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  unregister = registerRecordMenu(KEY, () => tabRows);
  act(() => {
    root.render(
      <div>
        <button type="button" data-testid="dots">⋯</button>
        <div {...{ [RECORD_MENU_ATTR]: KEY }}>
          <NonEditableContextMenu sourceFeature="documents" contentSource={{ type: "note", id: "note-1" } as never}>
            <article data-testid="content">
              <p data-testid="para">Call the supplier on Monday.</p>
            </article>
          </NonEditableContextMenu>
        </div>
      </div>,
    );
  });
});
afterEach(() => {
  unregister();
  act(() => root.unmount());
  host.remove();
});

it("a right-click on the content carries the record's rows and its entity", () => {
  act(() => {
    host.querySelector('[data-testid="para"]')!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });
  const last = seen[seen.length - 1];
  expect(last?.sections).toContain("note-tab");
  expect(last?.entity).toBe("note-1");
});

it("the ⋯ opens the content's own menu — the same rows as the right-click", () => {
  act(() => {
    host.querySelector('[data-testid="para"]')!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });
  const right = seen[seen.length - 1];
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  seen.length = 0;
  let opened = false;
  act(() => {
    opened = openRecordMenu(KEY, host.querySelector('[data-testid="dots"]') as HTMLElement);
  });
  expect(opened).toBe(true);
  expect(host.querySelector('[data-testid="content"]')!.getAttribute("data-state")).toBe("open");
  const dots = seen[seen.length - 1];
  expect(dots).toEqual(right);
});

it("no marked content on screen: the ⋯ says so (false) and the caller opens its own menu", () => {
  expect(openRecordMenu("note-tab:inst-1:not-open", host.querySelector('[data-testid="dots"]') as HTMLElement)).toBe(false);
});
