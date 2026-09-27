/**
 * THE PHONE HEADER KEEPS THE TITLE — the right set folds into ONE control.
 *
 * Page-pass shared defects (2026-09-27): at 375px Search, Agents, Canvas and
 * Inbox (44px each) plus the route's actions left the page title "C.",
 * "Fla…", "O…". Below 640px the four fold into `HeaderPhoneOverflow`, a bottom
 * sheet that holds the same four with the same states and the same gates.
 *
 * WHAT THIS PINS:
 *   1. Header.tsx puts the four inside `.shell-header-secondary` and mounts the
 *      overflow beside them; shell.css hides the one and shows the other below
 *      640px (and not above).
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
  click(host.querySelector('button[aria-label="Search, agents, canvas and inbox"]'));
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

  it("folds below 640px and only below it", () => {
    const css = read("styles/shell.css");
    expect(css).toMatch(/\.shell-header-overflow\s*\{\s*display:\s*none;/);
    expect(css).toMatch(
      /@media \(max-width: 639px\)\s*\{\s*\.shell-header-secondary\s*\{\s*display:\s*none;\s*\}\s*\.shell-header-overflow\s*\{\s*display:\s*flex;/,
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
    expect(host.textContent).toContain("3");
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
