/**
 * THE PHONE HEADER KEEPS THE TITLE — the right set folds into ONE control.
 *
 * Page-pass shared defects (2026-09-27): at 375px Search, Agents, Canvas and
 * Inbox (44px each) plus the route's actions left the page title "C.",
 * "Fla…", "O…". Below 768px the four fold into `HeaderPhoneOverflow`, a bottom
 * sheet that holds the same four with the same states and the same gates.
 *
 * WHAT THIS PINS:
 *   1. Header.tsx puts the four inside `.shell-header-secondary` and mounts the
 *      overflow beside them; shell.css hides the one and shows the other below
 *      768px (and not above), the width `useIsMobile` calls a phone.
 *   2. The sheet holds all four; an empty canvas is a DISABLED row that says
 *      why; a guest reaching for Agents or Inbox gets the auth gate, never a
 *      dead row; a signed-in Inbox press opens the inbox in the sheet.
 *
 * PROVEN FAILING BEFORE PASSING: against the pre-fix header, case 1 is RED
 * (no `.shell-header-secondary`, no overflow, no media rule).
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPO = path.resolve(__dirname, "..", "..", "..", "..");
const read = (file: string) => readFileSync(path.join(REPO, file), "utf8");

const openBar = jest.fn();
const openAuthGate = jest.fn();
let canvasState = { isOpen: false, isAvailable: true, itemCount: 0, headlineTitle: "Canvas" };
const reopen = jest.fn();
const putAway = jest.fn();

jest.mock("@/features/knowledge/command-bar/OpenCommandBarButtons", () => ({
  useOpenBarOrGate: () => openBar,
}));
jest.mock("@/features/overlays/openers/authGate", () => ({
  useOpenAuthGateDialog: () => openAuthGate,
}));
jest.mock("@/features/surfaces/components/chrome/SurfaceAgentsHeaderButton", () => ({
  AGENTS_AUTH_GATE: { featureName: "Agents", featureDescription: "x" },
  SurfaceAgentsPanelImpl: () => <div data-testid="agents-panel">agents</div>,
}));
jest.mock("@/features/canvas/core/CanvasHeaderToggle", () => ({
  CANVAS_EMPTY_TOOLTIP: "Canvas is empty — open a document and it appears here",
  useCanvasHeaderToggle: () => ({ ...canvasState, reopen, putAway }),
}));
jest.mock("@/features/notifications/components/InboxHeaderButton", () => ({
  INBOX_AUTH_GATE: { featureName: "Inbox", featureDescription: "x" },
}));
jest.mock("@/features/notifications/components/InboxPanel", () => ({
  InboxPanel: () => <div data-testid="inbox-panel">inbox</div>,
}));
jest.mock("@/features/notifications/useInbox", () => ({
  useInboxCounts: () => ({ total: 3, partial: false }),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TooltipProvider } = require("@/components/ui/tooltip") as typeof import("@/components/ui/tooltip");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { HeaderPhoneOverflow } = require("./HeaderPhoneOverflow") as typeof import("./HeaderPhoneOverflow");

let host: HTMLElement;
let root: Root;

function mount(isAuthenticated: boolean) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <TooltipProvider>
        <HeaderPhoneOverflow isAuthenticated={isAuthenticated} />
      </TooltipProvider>,
    );
  });
}

function click(el: Element | null | undefined) {
  if (!el) throw new Error("element not found");
  act(() => {
    (el as HTMLElement).click();
  });
}

function openSheet() {
  click(host.querySelector('button[aria-label^="Search, agents"]'));
}

function row(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.trim().startsWith(label),
  );
}

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
  jest.clearAllMocks();
  canvasState = { isOpen: false, isAvailable: true, itemCount: 0, headlineTitle: "Canvas" };
});

describe("the header right set on a phone — source", () => {
  it("wraps the four in .shell-header-secondary and mounts the overflow beside them", () => {
    const header = read("features/shell/components/header/Header.tsx");
    const secondary = header.indexOf('className="shell-header-secondary"');
    expect(secondary).toBeGreaterThan(-1);
    for (const control of ["<CommandBarHeaderButton", "<SurfaceAgentsHeaderButton", "<CanvasShellHeaderToggle", "<InboxHeaderButton"]) {
      expect(header.indexOf(control)).toBeGreaterThan(secondary);
    }
    expect(header.indexOf("<HeaderPhoneOverflow")).toBeGreaterThan(header.indexOf("<InboxHeaderButton"));
  });

  it("folds below 768px and only below it", () => {
    const css = read("styles/shell.css");
    expect(css).toMatch(/\.shell-header-overflow\s*\{\s*display:\s*none;/);
    expect(css).toMatch(
      /@media \(max-width: 767px\)\s*\{\s*\.shell-header-secondary\s*\{\s*display:\s*none;\s*\}\s*\.shell-header-overflow\s*\{\s*display:\s*flex;/,
    );
  });
});

describe("HeaderPhoneOverflow — the same four, the same states", () => {
  it("holds Search, Agents, Canvas and Inbox; an empty canvas is disabled and says why", () => {
    mount(true);
    openSheet();
    expect(row("Search")).toBeDefined();
    expect(row("Agents for this page")).toBeDefined();
    expect(row("Inbox")).toBeDefined();
    const canvas = row("Canvas");
    expect(canvas?.disabled).toBe(true);
    expect(canvas?.textContent).toContain("Canvas is empty");
  });

  it("leaves the canvas row out where the route has no canvas", () => {
    canvasState = { ...canvasState, isAvailable: false };
    mount(true);
    openSheet();
    expect(row("Canvas")).toBeUndefined();
  });

  it("a canvas with items opens from the sheet", () => {
    canvasState = { ...canvasState, itemCount: 2, headlineTitle: "hello.py" };
    mount(true);
    openSheet();
    click(row("Open canvas — hello.py"));
    expect(reopen).toHaveBeenCalled();
  });

  it("Search opens the bar", () => {
    mount(true);
    openSheet();
    click(row("Search"));
    expect(openBar).toHaveBeenCalled();
  });

  it("signed in, Inbox opens the inbox in the sheet and the count rides the button", () => {
    mount(true);
    // The number rides the button's name; the visible mark is a dot in the
    // corner, never a "99+" pill over the ⋮ (page-pass, 2026-09-27).
    const trigger = host.querySelector('button[aria-label^="Search, agents"]');
    expect(trigger?.getAttribute("aria-label")).toContain("3 new in the inbox");
    const dot = host.querySelector("[data-header-overflow-unread]");
    expect(dot?.className).toContain("h-2 w-2");
    expect(dot?.textContent).toBe("");
    openSheet();
    click(row("Inbox"));
    expect(document.querySelector('[data-testid="inbox-panel"]')).not.toBeNull();
  });

  it("signed in, Agents opens the page's agents in the sheet", () => {
    mount(true);
    openSheet();
    click(row("Agents for this page"));
    expect(document.querySelector('[data-testid="agents-panel"]')).not.toBeNull();
  });

  it("a guest reaching for Agents or Inbox gets the auth gate, never a dead row", () => {
    mount(false);
    openSheet();
    click(row("Agents for this page"));
    expect(openAuthGate).toHaveBeenCalledWith(expect.objectContaining({ featureName: "Agents" }));
    openSheet();
    click(row("Inbox"));
    expect(openAuthGate).toHaveBeenCalledWith(expect.objectContaining({ featureName: "Inbox" }));
  });
});

describe("HeaderPhoneOverflow — the page's own actions, one overflow per phone header", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const store = require("./phone-page-actions") as typeof import("./phone-page-actions");

  it("publishes a host node, and shows a 'This page' section holding what a route header portaled there", () => {
    mount(true);
    const { host } = (() => {
      let snapshot = { host: null as HTMLElement | null };
      const Probe = () => {
        snapshot = store.usePhonePageActions();
        return null;
      };
      const probeRoot = createRoot(document.createElement("div"));
      act(() => probeRoot.render(<Probe />));
      act(() => probeRoot.unmount());
      return snapshot;
    })();
    expect(host).not.toBeNull();
    // A route header's action, portaled into the host (simulated here).
    const button = document.createElement("button");
    button.textContent = "Send email";
    host!.appendChild(button);
    act(() => store.setPhonePageActionCount("route-1", 1));
    openSheet();
    const section = document.querySelector('[data-header-page-actions]');
    expect(section?.textContent).toContain("This page");
    expect(section?.contains(button)).toBe(true);
    // The row stays one overflow: the page's actions are inside the sheet, not beside it.
    expect(host!.closest("[data-header-page-actions]")).not.toBeNull();
    act(() => store.setPhonePageActionCount("route-1", 0));
  });
});

describe("HeaderPhoneOverflow — no 0×0 pieces in 'This page'", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const store = require("./phone-page-actions") as typeof import("./phone-page-actions");

  it("hides an action row that draws nothing, and the section when nothing in it draws", () => {
    let host: HTMLElement | null = null;
    const Probe = () => {
      host = store.usePhonePageActions().host;
      return null;
    };
    mount(true);
    const probeRoot = createRoot(document.createElement("div"));
    act(() => probeRoot.render(<Probe />));
    // A desktop-only control (`hidden sm:flex`) portaled in: 0×0 on a phone.
    const item = document.createElement("div");
    item.setAttribute("data-route-header-overflow-item", "");
    item.appendChild(document.createElement("div"));
    host!.appendChild(item);
    act(() => store.setPhonePageActionCount("route-x", 1));
    openSheet();
    expect(item.style.display).toBe("none");
    const section = document.querySelector<HTMLElement>("[data-header-page-actions]");
    expect(section?.style.display).toBe("none");
    act(() => store.setPhonePageActionCount("route-x", 0));
    act(() => probeRoot.unmount());
  });
});

/**
 * CANVAS SHOWS ONCE (page-pass shared defects, 2026-09-27 follow-up):
 * `/chat/[id]` folds `ChatCanvasButton` into "This page" via
 * `HeaderActionsSlot` — it also names its own conversation's working
 * document, unlike the generic menu row's plain open/close/disabled states —
 * so the sheet drew BOTH the generic "Canvas" row here and the page's own
 * "Canvas" row in "This page". A page action that opts in with
 * `data-phone-sheet-replaces="canvas"` now suppresses the generic row so the
 * control appears once. PROVEN FAILING BEFORE PASSING: against the pre-fix
 * `HeaderPhoneOverflow`, both rows are present.
 */
describe("HeaderPhoneOverflow — Canvas shows once when a page provides its own", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const store = require("./phone-page-actions") as typeof import("./phone-page-actions");

  it("hides the generic Canvas row once a page action declares data-phone-sheet-replaces=\"canvas\"", () => {
    let host: HTMLElement | null = null;
    const Probe = () => {
      host = store.usePhonePageActions().host;
      return null;
    };
    mount(true);
    const probeRoot = createRoot(document.createElement("div"));
    act(() => probeRoot.render(<Probe />));
    const item = document.createElement("div");
    item.setAttribute("data-route-header-overflow-item", "");
    const pageCanvas = document.createElement("button");
    pageCanvas.setAttribute("data-phone-sheet-replaces", "canvas");
    pageCanvas.textContent = "Canvas";
    item.appendChild(pageCanvas);
    host!.appendChild(item);
    act(() => store.setPhonePageActionCount("route-chat", 1));
    openSheet();
    const genericRows = [...document.querySelectorAll("button")].filter((b) =>
      b.textContent?.trim().startsWith("Canvas"),
    );
    // Only the page's own row remains — the generic menu row is gone.
    expect(genericRows).toHaveLength(1);
    expect(genericRows[0]).toBe(pageCanvas);
    act(() => store.setPhonePageActionCount("route-chat", 0));
    act(() => probeRoot.unmount());
  });
});
