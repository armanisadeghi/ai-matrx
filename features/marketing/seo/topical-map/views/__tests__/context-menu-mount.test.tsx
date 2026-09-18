/** @jest-environment jsdom */

// features/marketing/seo/topical-map/views/__tests__/context-menu-mount.test.tsx
//
// WHY RIGHT-CLICK DID NOTHING IN THE OUTLINE AND THE TABLE.
//
// `ContextMenuV3` renders `<ContextMenuTrigger asChild>` and, when its children
// are a single element, slots the menu's `onContextMenu` and its ref straight
// onto that element. Both map views handed it a FUNCTION COMPONENT — the
// outline `<TopicTree>`, the table `<MatrxDataTable>` — and neither forwards a
// ref or spreads unknown props, so Radix's handlers landed on nothing: the menu
// was mounted, wired, and completely inert. The same class is already commented
// in `features/scheduling/components/list/ScheduleList.tsx` ("Radix `asChild`
// must receive a DOM element that can accept its context-menu handlers/ref. A
// function component drops those props."), which is why it wraps its body in
// `<div className="contents">`.
//
// Two legs, on purpose:
//   1. THE MECHANISM, in a real DOM, against the real shared components — a
//      bare `TopicTree` child never hears the right-click; the same tree inside
//      a `div.contents` does. Nothing is mocked but the lazy menu body.
//   2. THE BINDING — the two view files actually use that wrapper. Leg 1 proves
//      the fix works; only leg 2 proves the views have it. Neither replaces the
//      browser walk, which is the coordinator's.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TopicTree } from "@/components/official/topic-tree/TopicTree";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

// The lazy menu body pulls the whole action engine; the question here is only
// whether the right-click REACHES the shell.
jest.mock("next/dynamic", () => () => function TestMenuContent() {
  return null;
});
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/features/agents/hooks/useWidgetHandle", () => ({
  useOptionalWidgetHandle: () => null,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ROWS = [
  {
    id: "recycling",
    parentId: null,
    depth: 0,
    label: "Recycling",
    hasChildren: false,
    expanded: false,
    selected: false,
  },
];

describe("the mechanism — a function-component child hears no right-click", () => {
  let host: HTMLDivElement;
  let root: Root;
  const resolveContextOnOpen = jest.fn((..._args: unknown[]) => null);

  beforeEach(() => {
    resolveContextOnOpen.mockClear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function rightClickARow(): void {
    const row = host.querySelector<HTMLElement>("[data-topic-tree-row]");
    if (!row) throw new Error("The tree rendered no rows to right-click.");
    act(() => {
      row.dispatchEvent(
        new MouseEvent("contextmenu", { button: 2, bubbles: true, cancelable: true }),
      );
    });
  }

  it("drops the menu's handlers when the child is the bare TopicTree", () => {
    act(() => {
      root.render(
        <NonEditableContextMenu
          sourceFeature="marketing"
          resolveContextOnOpen={resolveContextOnOpen}
        >
          <TopicTree rows={ROWS} ariaLabel="Bare" onToggleExpand={() => {}} onSelect={() => {}} />
        </NonEditableContextMenu>,
      );
    });
    rightClickARow();
    // This is the shipped defect, reproduced: the menu is mounted and the
    // right-click never reaches it.
    expect(resolveContextOnOpen).not.toHaveBeenCalled();
  });

  it("hears it once a DOM element sits between the menu and the tree", () => {
    act(() => {
      root.render(
        <NonEditableContextMenu
          sourceFeature="marketing"
          resolveContextOnOpen={resolveContextOnOpen}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <TopicTree rows={ROWS} ariaLabel="Wrapped" onToggleExpand={() => {}} onSelect={() => {}} />
          </div>
        </NonEditableContextMenu>,
      );
    });
    rightClickARow();
    expect(resolveContextOnOpen).toHaveBeenCalled();
    const target = resolveContextOnOpen.mock.calls[0][0] as unknown as HTMLElement;
    // It is handed the element that was clicked, so `closest("[data-topic-tree-row]")`
    // can name the row — which is how one menu serves every row.
    expect(target.closest("[data-topic-tree-row]")?.getAttribute("data-topic-tree-row")).toBe(
      "recycling",
    );
  });
});

describe("the binding — both map views mount the menu over a DOM element", () => {
  const source = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  // WHICH div is not the invariant — `display: contents` and a real flex column
  // both take the handlers, and the coordinator moved these to flex columns so
  // the scroll-chain guard can read them. What must never come back is a
  // function component sitting directly inside the menu.
  const WRAPPED_TREE = /<NonEditableContextMenu[\s\S]*?<div className="[^"]*">[\s\S]*?<TopicTree/;
  const WRAPPED_TABLE = /<NonEditableContextMenu[\s\S]*?<div className="[^"]*">[\s\S]*?<MatrxDataTable/;
  const NAKED = /<NonEditableContextMenu[^>]*>\s*\{?\s*<[A-Z]/;

  it("the outline wraps its TopicTree", () => {
    const outline = source("features/marketing/seo/topical-map/views/OutlineView.tsx");
    expect(outline.match(/<NonEditableContextMenu/g)).toHaveLength(1);
    expect(outline).toMatch(WRAPPED_TREE);
    expect(outline).not.toMatch(NAKED);
  });

  it("the table wraps its MatrxDataTable", () => {
    const table = source("features/marketing/seo/topical-map/views/table/TopicTable.tsx");
    expect(table.match(/<NonEditableContextMenu/g)).toHaveLength(1);
    expect(table).toMatch(WRAPPED_TABLE);
    expect(table).not.toMatch(NAKED);
  });
});
