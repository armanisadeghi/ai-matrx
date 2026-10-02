/**
 * THE PHONE HEADER KEEPS THE TITLE — the right set folds into ONE control.
 *
 * Page-pass shared defects (2026-09-27): at 375px the header controls (44px
 * each) plus the route's actions left the page title "C.", "Fla…", "O…".
 * Below 768px the set folds into `HeaderPhoneOverflow`, a bottom sheet that
 * holds the same controls with the same states and the same gates.
 *
 * WHAT THIS PINS:
 *   1. HeaderControlSet puts Search, Intelligence, Canvas, Messages and
 *      Notifications inside `.shell-header-secondary` and mounts the overflow
 *      beside them; shell.css hides the one and shows the other below 768px.
 *   2. The sheet holds all five; an empty canvas is an ENABLED row (it opens
 *      the canvas — owner, 2026-09-30: "always available and clickable");
 *      Messages and Notifications open their canvas tabs (owner, 2026-10-02);
 *      a guest reaching for Intelligence, Messages or Notifications gets the
 *      auth gate, never a dead row.
 *
 * The Canvas row runs on the REAL `@ai-matrx/canvas` controller: a standalone
 * `createCanvasStore()` under `CanvasProvider`, read through the real
 * `useCanvasHeaderToggle`. Rows are asserted by what they DO to that store.
 * Availability is the package's: a canvas column registered as presented.
 * (The old "availability unknown" reservation is gone — the hook always
 * knows.)
 *
 * PROVEN FAILING BEFORE PASSING: against the pre-fix header, case 1 is RED
 * (no `.shell-header-secondary`, no overflow, no media rule). Planted
 * 2026-10-01: `reopen: () => canvas.hide()` in `useCanvasHeaderToggle` → both
 * "opens the canvas" cases RED (2 failed).
 */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { canvasActions, createCanvasStore, type CanvasStoreBinding } from "@ai-matrx/canvas";
import { CanvasProvider, registerCanvasKinds, useCanvas } from "@ai-matrx/canvas/react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPO = path.resolve(__dirname, "..", "..", "..", "..");
const read = (file: string) => readFileSync(path.join(REPO, file), "utf8");

const openBar = jest.fn();
const openAuthGate = jest.fn();
let canvasStore: CanvasStoreBinding = createCanvasStore();
let canvasPresented = true;

/** Stands in for the shell's canvas column being on screen. */
function PresentedColumn() {
  const canvas = useCanvas();
  useEffect(() => canvas.registerPresentation(), [canvas]);
  return null;
}

jest.mock("@/features/knowledge/command-bar/OpenCommandBarButtons", () => ({
  useOpenBarOrGate: () => openBar,
}));
jest.mock("@/features/overlays/openers/authGate", () => ({
  useOpenAuthGateDialog: () => openAuthGate,
}));
jest.mock("@ai-matrx/chat/surfaces/components/chrome/SurfaceAgentsHeaderButton", () => ({
  AGENTS_AUTH_GATE: { featureName: "Agents", featureDescription: "x" },
  SurfaceAgentsPanelImpl: () => <div data-testid="agents-panel">agents</div>,
}));
jest.mock("@/features/notifications/components/InboxHeaderButton", () => ({
  INBOX_AUTH_GATE: { featureName: "Inbox", featureDescription: "x" },
}));
jest.mock("@/features/notifications/useInbox", () => ({
  useInboxCounts: () => ({ badge: 3, partial: false }),
}));
jest.mock("@/features/messaging/components/shell/MessagesHeaderButton", () => ({
  MESSAGES_AUTH_GATE: { featureName: "Messages", featureDescription: "x" },
  useUnreadConversationCount: () => 2,
}));
// The real Messages and Notifications canvas kinds — the rows open THEM.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { messagesKind, MESSAGES_KIND } = require("@/features/messaging/canvas/messagesKind") as typeof import("@/features/messaging/canvas/messagesKind");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { notificationsKind, NOTIFICATIONS_KIND } = require("@/features/notifications/canvas/notificationsKind") as typeof import("@/features/notifications/canvas/notificationsKind");
registerCanvasKinds([messagesKind, notificationsKind]);
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
      <CanvasProvider store={canvasStore} persistence={null} hotkeys={false}>
        {canvasPresented ? <PresentedColumn /> : null}
        <TooltipProvider>
          <HeaderPhoneOverflow isAuthenticated={isAuthenticated} />
        </TooltipProvider>
      </CanvasProvider>,
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
  click(host.querySelector('button[aria-label^="Search, intelligence"]'));
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
  canvasStore = createCanvasStore();
  canvasPresented = true;
});

/** Two real tabs on the canvas; the active one is titled `hello.py`. */
function seedTwoTabs(open: boolean) {
  canvasStore.dispatch(canvasActions.open({ kind: "code", key: "a", title: "notes.md" }));
  canvasStore.dispatch(canvasActions.open({ kind: "code", key: "b", title: "hello.py" }));
  canvasStore.dispatch(canvasActions.setOpen(open));
}

describe("the header right set on a phone — source", () => {
  it("wraps the five in .shell-header-secondary and mounts the overflow beside them", () => {
    const header = read("features/shell/components/header/HeaderControlSet.tsx");
    const secondary = header.indexOf('className="shell-header-secondary"');
    expect(secondary).toBeGreaterThan(-1);
    for (const control of [
      "<CommandBarHeaderButton",
      "<SurfaceAgentsHeaderButton",
      "<CanvasToggle",
      "<MessagesHeaderButton",
      "<InboxHeaderButton",
    ]) {
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
  it("holds all five; an empty canvas is a live row that opens the canvas", () => {
    mount(true);
    openSheet();
    expect(row("Search")).toBeDefined();
    expect(row("Intelligence")).toBeDefined();
    expect(row("Messages")?.textContent).toContain("2");
    expect(row("Notifications")).toBeDefined();
    const canvas = row("Canvas");
    expect(canvas?.disabled).toBe(false);
    expect(canvasStore.getState().isOpen).toBe(false);
    click(canvas);
    expect(canvasStore.getState().isOpen).toBe(true);
  });

  it("Messages opens the Messages canvas tab", () => {
    mount(true);
    openSheet();
    click(row("Messages"));
    expect(canvasStore.getState().items[`${MESSAGES_KIND}::default`]).toBeDefined();
    expect(canvasStore.getState().isOpen).toBe(true);
  });

  it("a put-away canvas with tabs names its active tab and opens from the sheet", () => {
    seedTwoTabs(false);
    mount(true);
    openSheet();
    click(row("Open canvas — hello.py"));
    expect(canvasStore.getState().isOpen).toBe(true);
  });

  it("an open canvas is put away from the sheet", () => {
    seedTwoTabs(true);
    mount(true);
    openSheet();
    click(row("Put away canvas — hello.py"));
    expect(canvasStore.getState().isOpen).toBe(false);
  });

  it("leaves the canvas row out where no canvas column is on screen", () => {
    canvasPresented = false;
    mount(true);
    openSheet();
    expect(row("Search")).toBeDefined();
    expect(row("Canvas")).toBeUndefined();
  });

  it("Search opens the bar", () => {
    mount(true);
    openSheet();
    click(row("Search"));
    expect(openBar).toHaveBeenCalled();
  });

  it("signed in, Notifications opens the Notifications canvas tab and the count rides the button", () => {
    mount(true);
    // The number rides the button's name; the visible mark is a dot in the
    // corner, never a "99+" pill over the ⋮ (page-pass, 2026-09-27).
    // 3 notifications + 2 unread conversations.
    const trigger = host.querySelector('button[aria-label^="Search, intelligence"]');
    expect(trigger?.getAttribute("aria-label")).toContain("5 new");
    const dot = host.querySelector("[data-header-overflow-unread]");
    expect(dot?.className).toContain("h-2 w-2");
    expect(dot?.textContent).toBe("");
    openSheet();
    click(row("Notifications"));
    expect(canvasStore.getState().items[`${NOTIFICATIONS_KIND}::default`]).toBeDefined();
    expect(canvasStore.getState().isOpen).toBe(true);
  });

  it("signed in, Intelligence opens the page's agents in the sheet", () => {
    mount(true);
    openSheet();
    click(row("Intelligence"));
    expect(document.querySelector('[data-testid="agents-panel"]')).not.toBeNull();
  });

  it("a guest reaching for Intelligence, Messages or Notifications gets the auth gate, never a dead row", () => {
    mount(false);
    openSheet();
    click(row("Intelligence"));
    expect(openAuthGate).toHaveBeenCalledWith(expect.objectContaining({ featureName: "Agents" }));
    openSheet();
    click(row("Messages"));
    expect(openAuthGate).toHaveBeenCalledWith(expect.objectContaining({ featureName: "Messages" }));
    openSheet();
    click(row("Notifications"));
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
 * THE CANVAS ROW IS ALWAYS THE SHELL'S (owner, 2026-10-02). Until then a page
 * action could hide the generic Canvas row by declaring itself a replacement
 * (`/chat`'s own Canvas button) — and on a phone that page button was the only
 * Canvas left, answering "nothing to show yet". The chat button is gone and so
 * is the replace mechanism: whatever a page puts in "This page", the shell's
 * Canvas row stays. PROVEN FAILING BEFORE PASSING: against the pre-fix sheet
 * the generic row is hidden (1 row, not 2).
 */
describe("HeaderPhoneOverflow — the shell's Canvas row always shows", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const store = require("./phone-page-actions") as typeof import("./phone-page-actions");

  it("keeps the generic Canvas row beside a page action that names itself Canvas", () => {
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
    const canvasRows = [...document.querySelectorAll("button")].filter((b) =>
      b.textContent?.trim().startsWith("Canvas"),
    );
    expect(canvasRows).toHaveLength(2);
    act(() => store.setPhonePageActionCount("route-chat", 0));
    act(() => probeRoot.unmount());
  });
});
