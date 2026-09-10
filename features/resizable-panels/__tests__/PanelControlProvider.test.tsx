/**
 * Header toggle vs the REAL react-resizable-panels layout.
 *
 * SUT: PanelControlProvider.toggle() + RegisteredPanel + ClientGroup + Handle,
 * running the installed library. Only geometry is stood in (jsdom has no
 * layout) — see ./panelGeometry.ts. Every expected width is a literal worked
 * out from the panel props, never read back from the provider.
 *
 * Breaks each test names:
 *  - toggle builds a layout that does not sum to 100 and lets the library
 *    normalize it (every other panel moves, the reopened one comes back short)
 *  - toggle sets its collapsed flag from its intent, not from the layout the
 *    library actually applied (icon says open while the panel is shut)
 *  - the fallback open size is parsed as percent only ("220px"/220 -> 0)
 *  - a drag-collapse with no prior toggle has no remembered open width
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import type { Layout, PanelProps } from "react-resizable-panels";
import {
  dragSeparator,
  flushResizeObservers,
  installPanelGeometry,
  renderedPanelPercent,
  setGroupPx,
} from "./panelGeometry";
import { TasksShapedShell } from "./TasksShapedShell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let uninstallGeometry: () => void;
let container: HTMLDivElement;
let root: Root | null = null;
let warn: jest.SpyInstance;

beforeEach(() => {
  uninstallGeometry = installPanelGeometry();
  container = document.createElement("div");
  document.body.appendChild(container);
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  uninstallGeometry();
  warn.mockRestore();
});

function mount(props: Parameters<typeof TasksShapedShell>[0] = {}) {
  root = createRoot(container);
  act(() => root?.render(<TasksShapedShell {...props} />));
  flushResizeObservers();
}

function button(name: string): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>(`[data-toggle="${name}"]`);
  if (!el) throw new Error(`no toggle for ${name}`);
  return el;
}

function click(name: string) {
  act(() => button(name).click());
  flushResizeObservers();
}

function sizes() {
  return {
    sidebar: renderedPanelPercent(container, "sidebar"),
    list: renderedPanelPercent(container, "list"),
    editor: renderedPanelPercent(container, "editor"),
  };
}

/** What the header claims vs what the library renders. */
function sidebarTruth() {
  return {
    label: button("sidebar").textContent,
    open: renderedPanelPercent(container, "sidebar") > 0,
  };
}

function sidebarSeparator(): Element {
  // First separator in the group = the Handle between sidebar and list.
  const sep = container.querySelector("[data-separator]");
  if (!sep) throw new Error("sidebar handle is not rendered");
  return sep;
}

const COOKIE_SIDEBAR_COLLAPSED: Layout = { sidebar: 0, list: 16, editor: 84 };

describe("header toggle round trip (claim B: layout that does not sum to 100)", () => {
  it("restores the exact prior layout when the sidebar is toggled shut then open — no other column moves", () => {
    mount();
    expect(sizes()).toEqual({ sidebar: 16, list: 16, editor: 68 });

    click("sidebar");
    expect(sizes()).toEqual({ sidebar: 0, list: 16, editor: 84 });

    click("sidebar");
    expect(sizes()).toEqual({ sidebar: 16, list: 16, editor: 68 });
  });
});

describe("collapsed flag follows the applied layout (claim B: intent vs library)", () => {
  // 300px sidebar on a 4000px window = 7.5%. Shut it, shrink the window to
  // 1000px: minSize 200px is now 20%, so a 7.5% restore is below half of
  // minSize and the library snaps it shut again.
  function collapseOnWideThenShrink() {
    setGroupPx(4000);
    mount({ sidebar: { defaultSize: "300px", minSize: "200px" } });
    expect(renderedPanelPercent(container, "sidebar")).toBe(7.5);
    click("sidebar");
    setGroupPx(1000);
    flushResizeObservers();
    expect(sidebarTruth()).toEqual({ label: "Show sidebar", open: false });
  }

  it("reopens on every other click and its label always matches the library, across three clicks", () => {
    collapseOnWideThenShrink();
    const observed = [1, 2, 3].map(() => {
      click("sidebar");
      return sidebarTruth();
    });
    expect(observed).toEqual([
      { label: "Hide sidebar", open: true },
      { label: "Show sidebar", open: false },
      { label: "Hide sidebar", open: true },
    ]);
  });

  it("reopens at the current minSize (200px of 1000px = 20%) when the remembered width is now too small", () => {
    collapseOnWideThenShrink();
    click("sidebar");
    expect(renderedPanelPercent(container, "sidebar")).toBe(20);
  });

  it("announces the minSize clamp with a console.warn naming the panel", () => {
    collapseOnWideThenShrink();
    click("sidebar");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"sidebar"'));
  });
});

describe("fallback open size for a panel that mounted collapsed (claim A)", () => {
  it.each<[PanelProps["defaultSize"], number]>([
    ["220px", 22],
    [220, 22],
    ["25%", 25],
    ["30", 30],
  ])("reopens at defaultSize %p = %p%% of a 1000px group", (defaultSize, expected) => {
    mount({
      defaultLayout: COOKIE_SIDEBAR_COLLAPSED,
      sidebar: { defaultSize, minSize: "4%" },
    });
    expect(renderedPanelPercent(container, "sidebar")).toBe(0);

    click("sidebar");
    expect(renderedPanelPercent(container, "sidebar")).toBe(expected);
  });

  it("announces the defaultSize fallback with a console.warn naming the panel", () => {
    mount({
      defaultLayout: COOKIE_SIDEBAR_COLLAPSED,
      sidebar: { defaultSize: "220px", minSize: "4%" },
    });
    click("sidebar");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"sidebar"'));
  });
});

describe("drag-collapse then header reopen (claim D)", () => {
  // Drag the sidebar handle from 160px to 220px (sidebar 22%, list 10%), then
  // drag it to 0 — through minSize (80px) and the collapse snap. A settled
  // width of 22% existed; the live drag passed through slivers.
  function dragTo22ThenCollapse() {
    mount();
    dragSeparator(sidebarSeparator(), [190, 220]);
    expect(sizes()).toEqual({ sidebar: 22, list: 10, editor: 68 });
    dragSeparator(sidebarSeparator(), [150, 100, 60, 30, 0]);
    expect(sidebarTruth()).toEqual({ label: "Show sidebar", open: false });
  }

  it("reopens at the 22% the user dragged to, not the 16% defaultSize and not a drag sliver", () => {
    dragTo22ThenCollapse();
    const listBeforeReopen = renderedPanelPercent(container, "list");
    click("sidebar");
    expect({
      sidebar: renderedPanelPercent(container, "sidebar"),
      list: renderedPanelPercent(container, "list"),
    }).toEqual({ sidebar: 22, list: listBeforeReopen });
  });

  it("stays in step with the library over three drag-collapse -> header-reopen cycles", () => {
    dragTo22ThenCollapse();
    const cycles: Array<ReturnType<typeof sidebarTruth> & { width: number }> = [];
    for (let i = 0; i < 3; i++) {
      click("sidebar");
      cycles.push({ ...sidebarTruth(), width: renderedPanelPercent(container, "sidebar") });
      dragSeparator(sidebarSeparator(), [150, 60, 0]);
      cycles.push({ ...sidebarTruth(), width: renderedPanelPercent(container, "sidebar") });
    }
    const reopened = { label: "Hide sidebar", open: true, width: 22 };
    const shut = { label: "Show sidebar", open: false, width: 0 };
    expect(cycles).toEqual([reopened, shut, reopened, shut, reopened, shut]);
  });
});

describe("server paint of a cookie-collapsed panel (claim C) — hydration", () => {
  it("hydrates the seeded server paint with no hydration mismatch", () => {
    const seed = { initialLayouts: [COOKIE_SIDEBAR_COLLAPSED] };
    const props = { defaultLayout: COOKIE_SIDEBAR_COLLAPSED, providerProps: seed };
    container.innerHTML = renderToString(<TasksShapedShell {...props} />);
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const recoverable: unknown[] = [];
    act(() => {
      root = hydrateRoot(container, <TasksShapedShell {...props} />, {
        onRecoverableError: (e) => recoverable.push(e),
      });
    });
    flushResizeObservers();
    const hydrationErrors = errors.mock.calls.filter((args) =>
      String(args[0]).toLowerCase().includes("hydrat"),
    );
    errors.mockRestore();
    expect({ recoverable, hydrationErrors }).toEqual({ recoverable: [], hydrationErrors: [] });
    expect(sidebarTruth()).toEqual({ label: "Show sidebar", open: false });
  });
});
