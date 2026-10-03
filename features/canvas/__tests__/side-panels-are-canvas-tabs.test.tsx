/**
 * THE RIGHT-HAND REGION IS THE CANVAS (Arman, 2026-10-02: one right-hand
 * region; the second floating right panel is deleted).
 *
 * Everything that used to open the floating side panel now opens a canvas tab:
 *  - a page's own live panel (a data table's row detail, an admin create form,
 *    a link-policy editor) → `page-panel`, through `<CanvasPagePanel>`;
 *  - a person's acquisition journey → `user-journey`, keyed by the row;
 *  - a directive's item shape → `directive-shape`, keyed by verb and noun;
 *  - a topical-map topic whose org chose the `drawer` frame → `topical-map-topic`;
 *  - the suggestion inbox → `kg-suggestions`;
 *  - a record's Notes & comments → `comment-thread`, keyed by the record.
 *
 * And statically: no component draws its own fixed, full-height panel against
 * the right edge (the Notes & comments dock was one, 2026-10-03). A new one
 * goes RED here by file and line.
 *
 * Real pieces throughout: the app's root reducer, the app's ONE canvas binding
 * (`CanvasHostProvider`, which registers every kind), the real openers callers
 * use. A door that goes back to a floating panel, keys a tab by the moment
 * instead of the thing, or leaves a tab behind its page goes RED.
 */

import React, { act, useEffect, useState } from "react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import type { CanvasItem, CanvasState } from "@ai-matrx/canvas";
import { CanvasColumn, getCanvasKind, useCanvas } from "@ai-matrx/canvas/react";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { CanvasPagePanel, PAGE_PANEL_KIND } from "@/features/canvas/host/pagePanel";
import { openCanvasItem } from "@/features/canvas/host/openCanvasItem";
import { USER_JOURNEY_KIND, userJourneyOpenInput } from "@/features/admin/users/canvas/userJourneyKind";
import { DIRECTIVE_SHAPE_KIND, directiveShapeOpenInput } from "@/features/directive-catalog/canvas/directiveShapeKind";
import { TOPICAL_MAP_TOPIC_KIND } from "@/features/marketing/seo/topical-map/canvas/topicKind";
import { KG_SUGGESTIONS_KIND } from "@/features/kg-suggestions/canvas/kgSuggestionsKind";
import type { NounDirectives } from "@/features/directive-catalog/types";
import { TooltipProvider } from "@/components/ui/tooltip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout: the column's tab strip scrolls the active tab into view.
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

jest.mock("@/features/marketing/seo/topical-map/knobs", () => ({
  useTopicalMapKnobs: () => ({ knobs: { detail_panel: "drawer" }, loading: false, error: null }),
}));
jest.mock("@/features/window-panels/WindowPanel", () => ({ WindowPanel: () => null }));
jest.mock("@/features/marketing/seo/topical-map/panel/TopicDetailBody", () => ({ TopicDetailBody: () => null }));
jest.mock("@/features/kg-suggestions/hooks/useKgSuggestions", () => ({
  useKgSuggestions: () => ({ items: [], count: 3, status: "success", error: null }),
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/administration/users",
  useRouter: () => ({ push: () => undefined }),
}));
jest.mock("@/lib/scoped-config/effectiveKnobs.client", () => ({ useEffectiveKnob: () => null }));

// Imported after the mocks they depend on.
import TopicalMapTopicPanel from "@/features/window-panels/windows/marketing/TopicalMapTopicPanel";
import { KgSuggestionsNavButton } from "@/features/kg-suggestions/components/KgSuggestionsNavButton";
import { MatrxDataTableHost } from "@/components/official/MatrxDataTableHost";
import { useMatrxDataTableHost } from "@ai-matrx/design-system/data-table/host";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";

function makeStore() {
  return configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}
type Store = ReturnType<typeof makeStore>;

const canvasOf = (store: Store): CanvasState => store.getState().canvasHost;
const item = (store: Store, id: string): CanvasItem | undefined => canvasOf(store).items[id as CanvasItem["id"]];
const ids = (store: Store) => Object.keys(canvasOf(store).items);

/** Stands in for the shell's canvas column being on screen. */
function PresentedColumn() {
  const canvas = useCanvas();
  useEffect(() => canvas.registerPresentation(), [canvas]);
  return null;
}

function mount(store: Store, node: React.ReactNode, { column = false } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (next: React.ReactNode) =>
    act(() => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <Provider store={store}>
            <TooltipProvider>
              <CanvasHostProvider>
                {column ? <CanvasColumn /> : <PresentedColumn />}
                {next}
              </CanvasHostProvider>
            </TooltipProvider>
          </Provider>
        </QueryClientProvider>,
      );
    });
  render(node);
  return {
    container,
    rerender: render,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function useCanvasProbe(api: { canvas: ReturnType<typeof useCanvas> | null }) {
  api.canvas = useCanvas();
}

describe("a page's own panel is a canvas tab", () => {
  it("opens once per key, draws the page's content in the tab, and closes with its page", async () => {
    const store = makeStore();
    const closed: string[] = [];
    function Page({ show }: { show: boolean }) {
      return show ? (
        <>
          <CanvasPagePanel panelKey="new-rule" title="New rule" onClose={() => closed.push("a")}>
            <p data-page-content>the page&apos;s form</p>
          </CanvasPagePanel>
          <CanvasPagePanel panelKey="new-rule" title="New rule" onClose={() => closed.push("b")}>
            <p>same thing</p>
          </CanvasPagePanel>
        </>
      ) : null;
    }
    const m = mount(store, <Page show />, { column: true });
    // The tab body is portaled: the page's own element is inside the canvas column.
    await act(async () => {});
    expect(item(store, `${PAGE_PANEL_KIND}::new-rule`)?.title).toBe("New rule");
    expect(ids(store)).toEqual([`${PAGE_PANEL_KIND}::new-rule`]);
    expect(document.querySelector("[data-page-panel-slot] [data-page-content]")).not.toBeNull();
    // A live tree cannot come back after a reload.
    expect(getCanvasKind(PAGE_PANEL_KIND)?.restore).toBe(false);

    // The page unmounting closes the tab — it never outlives its content.
    m.rerender(<Page show={false} />);
    expect(ids(store)).toEqual([]);
    m.unmount();
  });

  it("tells the page when the person closes the tab", () => {
    const store = makeStore();
    const api: { canvas: ReturnType<typeof useCanvas> | null } = { canvas: null };
    function Page() {
      const [open, setOpen] = useState(true);
      useCanvasProbe(api);
      return open ? (
        <CanvasPagePanel title="Link policy" panelKey="link-policy:crm.party" onClose={() => setOpen(false)}>
          <p>policy</p>
        </CanvasPagePanel>
      ) : (
        <p data-closed>closed</p>
      );
    }
    const m = mount(store, <Page />);
    const id = `${PAGE_PANEL_KIND}::link-policy:crm.party`;
    expect(item(store, id)).toBeDefined();
    act(() => api.canvas!.close(id as CanvasItem["id"]));
    expect(m.container.querySelector("[data-closed]")).not.toBeNull();
    m.unmount();
  });

  it("a new title (another row) brings the same tab forward under its new name", () => {
    const store = makeStore();
    function Page({ row }: { row: string }) {
      return (
        <CanvasPagePanel title={row} onClose={() => undefined}>
          <p>{row}</p>
        </CanvasPagePanel>
      );
    }
    const m = mount(store, <Page row="Row one" />);
    const [first] = ids(store);
    m.rerender(<Page row="Row two" />);
    expect(ids(store)).toEqual([first]);
    expect(item(store, first!)?.title).toBe("Row two");
    m.unmount();
  });
});

describe("every data table's row detail is a canvas tab", () => {
  it("the app's table host hands every MatrxDataTable the canvas page panel", () => {
    const store = makeStore();
    function RowDetail() {
      // Exactly what MatrxDataTable renders for a selected row.
      const { SidePanelSurface } = useMatrxDataTableHost();
      if (!SidePanelSurface) return <p data-no-port>no port</p>;
      return (
        <SidePanelSurface title="Acme Corp" onClose={() => undefined}>
          <p>row fields</p>
        </SidePanelSurface>
      );
    }
    const m = mount(
      store,
      <MatrxDataTableHost>
        <RowDetail />
      </MatrxDataTableHost>,
    );
    const tabs = Object.values(canvasOf(store).items);
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.kind).toBe(PAGE_PANEL_KIND);
    expect(tabs[0]?.title).toBe("Acme Corp");
    m.unmount();
    expect(ids(store)).toEqual([]);
  });
});

describe("clicking the same row again brings its background tab forward", () => {
  it("a real MatrxDataTable re-click on the shown row focuses its tab", () => {
    const store = makeStore();
    const api: { canvas: ReturnType<typeof useCanvas> | null } = { canvas: null };
    function Probe() {
      useCanvasProbe(api);
      return null;
    }
    type Row = { id: string; name: string };
    const rows: Row[] = [
      { id: "r1", name: "Acme Corp" },
      { id: "r2", name: "Globex" },
    ];
    const m = mount(
      store,
      <MatrxDataTableHost>
        <Probe />
        <MatrxDataTable<Row>
          data={rows}
          columns={[{ accessorKey: "name", header: "Name" }]}
          getRowId={(row) => row.id}
          pageSize={0}
          window={{ enabled: false }}
        />
      </MatrxDataTableHost>,
    );
    const activeItem = () => {
      const state = canvasOf(store);
      return state.panes[state.focusedPaneId]?.activeItemId ?? null;
    };
    const cell = () => m.container.querySelector('tr[data-row-id="r1"] td:last-child') as HTMLElement;

    act(() => cell().click());
    const panel = ids(store).find((id) => id.startsWith(`${PAGE_PANEL_KIND}::`));
    expect(panel).toBeDefined();
    expect(activeItem()).toBe(panel);

    // Another tab comes forward; the row's tab sits in the background.
    act(() => void openCanvasItem(api.canvas, userJourneyOpenInput({ rowId: "row-7", name: "Dana Reyes" })));
    expect(activeItem()).toBe(`${USER_JOURNEY_KIND}::row-7`);

    // The same row, clicked again: its tab must come forward.
    act(() => cell().click());
    expect(activeItem()).toBe(panel);
    m.unmount();
  });
});

describe("detail about a thing opens a tab keyed by that thing", () => {
  function openWith(input: Parameters<typeof openCanvasItem>[1]) {
    const store = makeStore();
    const api: { canvas: ReturnType<typeof useCanvas> | null } = { canvas: null };
    function Probe() {
      useCanvasProbe(api);
      return null;
    }
    const m = mount(store, <Probe />);
    act(() => void openCanvasItem(api.canvas, input));
    act(() => void openCanvasItem(api.canvas, input));
    return { store, unmount: m.unmount };
  }

  it("a person's journey: one tab per acquisition row, restorable", () => {
    const { store, unmount } = openWith(userJourneyOpenInput({ rowId: "row-7", name: "Dana Reyes" }));
    expect(ids(store)).toEqual([`${USER_JOURNEY_KIND}::row-7`]);
    expect(item(store, `${USER_JOURNEY_KIND}::row-7`)?.title).toBe("Dana Reyes");
    expect(getCanvasKind(USER_JOURNEY_KIND)?.restore).toBe(true);
    unmount();
  });

  it("a directive's shape: one tab per verb and noun, schema in the tab", () => {
    const noun = { noun: "task", label: "Task", table: "projects.tasks", schemas: { create: { type: "object" } } } as unknown as NounDirectives;
    const { store, unmount } = openWith(directiveShapeOpenInput({ kind: "directive", noun, verb: "create" }));
    expect(ids(store)).toEqual([`${DIRECTIVE_SHAPE_KIND}::create:task`]);
    expect(item(store, `${DIRECTIVE_SHAPE_KIND}::create:task`)?.data).toMatchObject({ schema: { type: "object" } });
    unmount();
  });
});

describe("the topic panel's drawer frame is the canvas", () => {
  it("opens the topic's tab and closes the overlay instance", () => {
    const store = makeStore();
    const onClose = jest.fn();
    const m = mount(
      store,
      <TopicalMapTopicPanel instanceId="map-1|pricing" mapId="map-1" slug="pricing-pages" siteId={null} onClose={onClose} />,
    );
    expect(item(store, `${TOPICAL_MAP_TOPIC_KIND}::map-1|pricing-pages`)?.title).toBe("Pricing pages");
    expect(onClose).toHaveBeenCalledTimes(1);
    m.unmount();
  });
});

describe("the suggestion inbox is a canvas tab", () => {
  it("the nav button opens the inbox tab, and reopening focuses it", () => {
    const store = makeStore();
    const m = mount(store, <KgSuggestionsNavButton />);
    const button = m.container.querySelector("button");
    act(() => button?.click());
    act(() => button?.click());
    expect(ids(store)).toEqual([`${KG_SUGGESTIONS_KIND}::inbox`]);
    expect(canvasOf(store).isOpen).toBe(true);
    m.unmount();
  });
});

// ── no fixed right-hand panel (static) ─────────────────────────────────────

/**
 * A fixed element pinned to the right edge that spans the window's height: a
 * class list with `fixed` and `right-*` (no `left-*`/`inset-x-*`: a full-width
 * bar is not a side panel) and a vertical span — `inset-y-*`, `top-*` with
 * `bottom-*`/`h-full|screen|dvh`, or a `style` beside it setting both `top`
 * and `bottom`. Only unprefixed utilities count (`sm:right-0` on a toast is a
 * breakpoint, not a dock).
 */
function fixedRightPanelLines(source: string): number[] {
  const lines = source.split("\n");
  const hits: number[] = [];
  const strings = /"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g;
  lines.forEach((line, i) => {
    for (const m of line.matchAll(strings)) {
      const tokens = (m[1] ?? m[2] ?? m[3] ?? "").split(/[\s"'{}$()?]+/);
      const has = (re: RegExp) => tokens.some((t) => re.test(t));
      if (!has(/^fixed$/) || !has(/^right-/)) continue;
      if (has(/^(left-|inset-x-|inset-0$)/)) continue;
      const top = has(/^top-/);
      const spans =
        has(/^inset-y-/) ||
        (top && has(/^(bottom-|h-(full|screen|dvh|svh|\[))/)) ||
        (() => {
          const near = lines.slice(i, i + 4).join(" ");
          const style = near.match(/style=\{\{([^}]*)\}\}/)?.[1] ?? "";
          return /\btop\s*:/.test(style) && /\bbottom\s*:/.test(style);
        })();
      if (spans) {
        hits.push(i + 1);
        break;
      }
    }
  });
  return hits;
}

/**
 * Right-edge panels that predate the rule, named so the list only shrinks.
 * Each still owes its move into the canvas (or its deletion).
 */
const KNOWN_FIXED_RIGHT_PANELS = [
  "components/matrx/resizable/MatrxDynamicPanel.tsx",
  "components/matrx/resizable/MatrxPanel.tsx",
  "components/matrx/resizable/dev/ResizableRightPanel.tsx",
];

describe("no component draws its own fixed right-hand panel", () => {
  it("the detector sees the old floating Notes & comments dock, and not a toast or a bar", () => {
    const oldDock = [
      "    <div",
      '      role="complementary"',
      '      className="fixed right-3 z-50 flex w-[22rem] flex-col rounded-lg border bg-card shadow-xl"',
      '      style={{ top: "calc(var(--header-height, 3rem) + 0.75rem)", bottom: "0.75rem" }}',
      "    >",
    ].join("\n");
    expect(fixedRightPanelLines(oldDock)).toEqual([3]);
    expect(fixedRightPanelLines('<div className="fixed inset-y-0 right-0 z-50" />')).toEqual([1]);
    expect(fixedRightPanelLines('<div className="fixed bottom-4 right-4 w-[340px]" />')).toEqual([]);
    expect(fixedRightPanelLines('<div className="fixed bottom-0 left-0 right-0 pb-safe" />')).toEqual([]);
    expect(fixedRightPanelLines('"fixed top-0 z-[100] flex max-h-dvh sm:bottom-0 sm:right-0 sm:top-auto"')).toEqual([]);
  });

  it("no tracked component outside the named list has one", () => {
    const files = execSync("git ls-files '*.tsx'", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\n")
      .filter((p) => p && !/(__tests__\/|\.test\.tsx$|\.spec\.tsx$)/.test(p));
    const found: string[] = [];
    for (const file of files) {
      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue; // deleted in the working tree
      }
      if (!source.includes("fixed")) continue;
      for (const line of fixedRightPanelLines(source)) found.push(`${file}:${line}`);
    }
    const unknown = found.filter((hit) => !KNOWN_FIXED_RIGHT_PANELS.some((known) => hit.startsWith(`${known}:`)));
    // Detail about a thing opens a canvas tab keyed by that thing; a page's own panel is <CanvasPagePanel>.
    expect(unknown).toEqual([]);
    // Shrink-only: a named panel that is gone leaves the list.
    for (const known of KNOWN_FIXED_RIGHT_PANELS) expect(found.some((hit) => hit.startsWith(`${known}:`))).toBe(true);
  });
});
