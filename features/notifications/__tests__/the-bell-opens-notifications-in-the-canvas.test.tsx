/**
 * THE BELL AND MESSAGES OPEN IN THE CANVAS (owner, 2026-10-02: "Notifications
 * is a perfect vertical split one").
 *
 * Runs the real header buttons on the real `@ai-matrx/canvas` controller with
 * the real Messages / Notifications kinds registered:
 *   - the bell opens Notifications in a NEW pane below the tab in front, and a
 *     second press closes it;
 *   - on an empty canvas the bell just opens it (no empty pane above);
 *   - Messages toggles its tab; the button is pressed while it is in front.
 *
 * PROVEN FAILING BEFORE PASSING (2026-10-02): against the previous buttons
 * (a popover holding BellPanel, a Redux-toggled side sheet) every case is RED
 * — nothing lands on the canvas; with `target: "split-down"` removed from
 * `useNotificationsToggle` the split case is RED (one pane, not two).
 */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { canvasActions, createCanvasStore, type CanvasLayoutNode, type CanvasStoreBinding } from "@ai-matrx/canvas";
import { CanvasProvider, defineCanvasKind, registerCanvasKinds, useCanvas } from "@ai-matrx/canvas/react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/notifications/useInbox", () => ({
  useInboxCounts: () => ({ badge: 2, partial: false, updatesDot: false }),
}));
jest.mock("@ai-matrx/messaging/react", () => ({
  useConversations: () => ({ totalUnreadConversations: 1 }),
}));
jest.mock("@/features/overlays/openers/authGate", () => ({
  useOpenAuthGateDialog: () => jest.fn(),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TooltipProvider } = require("@/components/ui/tooltip") as typeof import("@/components/ui/tooltip");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { InboxHeaderButton } = require("../components/InboxHeaderButton") as typeof import("../components/InboxHeaderButton");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MessagesHeaderButton } = require("@/features/messaging/components/shell/MessagesHeaderButton") as typeof import("@/features/messaging/components/shell/MessagesHeaderButton");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { notificationsKind, NOTIFICATIONS_KIND } = require("../canvas/notificationsKind") as typeof import("../canvas/notificationsKind");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { messagesKind, MESSAGES_KIND } = require("@/features/messaging/canvas/messagesKind") as typeof import("@/features/messaging/canvas/messagesKind");

const NOTE_KIND = "test-note";
registerCanvasKinds([
  notificationsKind,
  messagesKind,
  defineCanvasKind<null>({ id: NOTE_KIND, label: "Note", surface: "dom", icon: () => null, component: () => null }),
]);

const NOTIFICATIONS_ID = `${NOTIFICATIONS_KIND}::default`;
const MESSAGES_ID = `${MESSAGES_KIND}::default`;

let store: CanvasStoreBinding;
let host: HTMLElement;
let root: Root;

function PresentedColumn() {
  const canvas = useCanvas();
  useEffect(() => canvas.registerPresentation(), [canvas]);
  return null;
}

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <CanvasProvider store={store} persistence={null} hotkeys={false}>
        <PresentedColumn />
        <TooltipProvider>
          <InboxHeaderButton isAuthenticated />
          <MessagesHeaderButton isAuthenticated />
        </TooltipProvider>
      </CanvasProvider>,
    );
  });
}

function press(selector: string) {
  const button = host.querySelector<HTMLButtonElement>(`${selector} button`);
  if (!button) throw new Error(`no button in ${selector}`);
  act(() => button.click());
}

function pressed(selector: string): boolean {
  return host.querySelector(`${selector} button`)?.getAttribute("aria-pressed") === "true";
}

function panesIn(node: CanvasLayoutNode): number {
  return node.type === "pane" ? 1 : node.children.reduce((sum, child) => sum + panesIn(child), 0);
}

beforeEach(() => {
  store = createCanvasStore();
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("the header bell", () => {
  it("opens Notifications in a pane below the tab in front, and a second press closes it", () => {
    // A tab is already showing.
    store.dispatch(canvasActions.open({ kind: NOTE_KIND, key: "a", title: "A" }));
    mount();

    press("[data-inbox-header-button]");
    const state = store.getState();
    expect(state.items[NOTIFICATIONS_ID]).toBeDefined();
    expect(state.layout.type).toBe("split");
    expect(state.layout.type === "split" ? state.layout.orientation : null).toBe("vertical");
    expect(panesIn(state.layout)).toBe(2);
    expect(pressed("[data-inbox-header-button]")).toBe(true);

    press("[data-inbox-header-button]");
    expect(store.getState().items[NOTIFICATIONS_ID]).toBeUndefined();
    expect(pressed("[data-inbox-header-button]")).toBe(false);
  });

  it("on an empty canvas it just opens — no empty pane above it", () => {
    mount();
    press("[data-inbox-header-button]");
    const state = store.getState();
    expect(state.items[NOTIFICATIONS_ID]).toBeDefined();
    expect(state.isOpen).toBe(true);
    expect(panesIn(state.layout)).toBe(1);
  });
});

describe("the header Messages button", () => {
  it("toggles the Messages tab and is pressed while it is in front", () => {
    mount();
    press("[data-messages-header-button]");
    expect(store.getState().items[MESSAGES_ID]).toBeDefined();
    expect(store.getState().isOpen).toBe(true);
    expect(pressed("[data-messages-header-button]")).toBe(true);

    press("[data-messages-header-button]");
    expect(store.getState().items[MESSAGES_ID]).toBeUndefined();
  });
});
