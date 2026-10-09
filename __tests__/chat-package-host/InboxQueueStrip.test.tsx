/**
 * Inbox cards are the only visible acknowledgement of work that has been
 * saved between turns. These mount the real strip and reducer; only the
 * promotion transport stays unresolved so the in-flight feedback can be
 * asserted before the server decides whether the retract won its race.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { TooltipProvider } from "@ai-matrx/design-system";
import inboxReducer, {
  addInboxItem,
  type ConversationInboxItem,
} from "@ai-matrx/chat/agents/redux/execution-system/inbox/inbox.slice";
import { InboxQueueStrip } from "@ai-matrx/chat/agents/components/inputs/smart-input/InboxQueueStrip";
import { promoteQueuedToSteer } from "@ai-matrx/chat/agents/redux/execution-system/inbox/inbox.thunks";

// Editing itself has separate dialog coverage; this strip test exercises the
// availability of its entry point without depending on jsdom media queries.


// The real promotion does a DELETE followed by a POST. Keep that boundary
// pending: this is the interval in which a second click used to be possible.
jest.mock(
  "@ai-matrx/chat/agents/redux/execution-system/inbox/inbox.thunks",
  () => ({
    promoteQueuedToSteer: jest.fn(
      () => () => new Promise<void>(() => undefined),
    ),
    enqueueInboxMessage: jest.fn((payload: unknown) => ({
      type: "inbox/test-enqueue",
      payload,
    })),
    retractInboxItem: jest.fn((payload: unknown) => ({
      type: "inbox/test-retract",
      payload,
    })),
    editInboxItem: jest.fn((payload: unknown) => ({
      type: "inbox/test-edit",
      payload,
    })),
  }),
);

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const CONVERSATION_ID = "inbox-strip-conversation";

function item(
  injectionId: string,
  overrides: Partial<ConversationInboxItem> = {},
): ConversationInboxItem {
  return {
    injectionId,
    conversationId: CONVERSATION_ID,
    mode: "queue",
    kind: "user_message",
    text: `${injectionId} text`,
    status: "pending",
    isVisibleToUser: true,
    queuedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("InboxQueueStrip turn-boundary feedback", () => {
  let container: HTMLDivElement;
  let root: Root;
  let store: ReturnType<typeof makeStore>;

  // The conversation's run state: the strip's promises depend on it (W-48).
  let runStatus: "running" | "cancelled" = "running";
  const makeStore = () =>
    configureStore({
      reducer: {
        conversationInbox: inboxReducer,
        conversations: (
          state = { byConversationId: { [CONVERSATION_ID]: { status: runStatus } } },
        ) => state,
      },
    });

  beforeEach(() => {
    jest.mocked(promoteQueuedToSteer).mockClear();
    runStatus = "running";
    store = makeStore();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(items: ConversationInboxItem[]) {
    act(() => {
      items.forEach((inboxItem) => store.dispatch(addInboxItem(inboxItem)));
      root.render(
        <Provider store={store}>
          <TooltipProvider>
            <InboxQueueStrip conversationId={CONVERSATION_ID} />
          </TooltipProvider>
        </Provider>,
      );
    });
  }

  it("moves a promoted queue message into an immediate sending bubble and blocks repeat delivery", () => {
    render([item("queued-first"), item("queued-second")]);

    const promote = container.querySelector<HTMLButtonElement>(
      '[aria-label="Deliver queued message at the agent\'s next pause"]',
    );
    expect(promote).not.toBeNull();
    act(() => promote?.click());

    expect(promoteQueuedToSteer).toHaveBeenCalledWith({
      conversationId: CONVERSATION_ID,
      injectionId: "queued-first",
    });
    const departing = container.querySelector<HTMLElement>(
      '[data-inbox-mode="steer"]',
    );
    expect(departing?.getAttribute("aria-busy")).toBe("true");
    expect(departing?.className).toContain("ml-8");
    expect(departing?.className).toContain("mb-6");
    expect(departing?.textContent).toContain("Sending…");
    expect(
      departing?.querySelector(
        '[aria-label="Deliver queued message at the agent\'s next pause"]',
      ),
    ).toBeNull();
    expect(
      departing?.querySelector('[aria-label="Edit queued message"]'),
    ).toBeNull();
    expect(
      departing?.querySelector('[aria-label="Withdraw queued message"]'),
    ).toBeNull();

    const waiting = container.querySelectorAll('[data-inbox-mode="queue"]');
    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.textContent).toContain("queued-second text");
  });

  it("distinguishes a pending steer from waiting queue work while leaving queue editing available", () => {
    render([
      item("steer-pending", { mode: "steer", text: "steer instruction" }),
      item("queue-pending", { text: "queue instruction" }),
    ]);

    const steer = container.querySelector<HTMLElement>(
      '[data-inbox-mode="steer"]',
    );
    const queue = container.querySelector<HTMLElement>(
      '[data-inbox-mode="queue"]',
    );
    expect(steer?.textContent).toContain("Sent · awaiting the next pause");
    expect(queue?.textContent).toContain(
      "Queued — sends when the agent finishes",
    );
    expect(
      queue?.querySelector('[aria-label="Edit queued message"]'),
    ).not.toBeNull();
    expect(
      queue?.querySelector('[aria-label="Withdraw queued message"]'),
    ).not.toBeNull();
  });

  it("never promises 'when the agent finishes' with nothing running", () => {
    runStatus = "cancelled";
    store = makeStore();
    render([
      item("steer-pending", { mode: "steer", text: "steer instruction" }),
      item("queue-pending", { text: "Also confirm the wine fridge travels upright." }),
    ]);
    const text = container.textContent ?? "";
    expect(text).not.toContain("sends when the agent finishes");
    expect(text).not.toContain("awaiting the next pause");
    expect(
      container.querySelectorAll('[data-inbox-mode] ').length,
    ).toBeGreaterThan(0);
    expect(text.match(/Waiting — sends after your next message/g)).toHaveLength(2);
  });

  it("keeps a failed message visible with its retry affordance", () => {
    render([
      item("failed-message", {
        text: "retry this saved instruction",
        status: "failed",
        error: "The connection was interrupted.",
      }),
    ]);

    const failed = container.querySelector<HTMLElement>(
      '[data-inbox-mode="queue"]',
    );
    expect(failed?.textContent).toContain("retry this saved instruction");
    expect(failed?.textContent).toContain("The connection was interrupted.");
    expect(
      failed?.querySelector('[aria-label="Retry queued message"]'),
    ).not.toBeNull();
    expect(
      failed?.querySelector('[aria-label="Dismiss failed message"]'),
    ).not.toBeNull();
  });
});
