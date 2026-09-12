import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import messages, {
  hydrateMessages,
  type MessageRecord,
} from "@/features/agents/redux/execution-system/messages/messages.slice";
import conversations from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import creatorDebug from "@/lib/redux/preferences/creatorDebugSlice";
import { loadOlderMessages } from "@/features/agents/redux/execution-system/thunks/load-older-messages.thunk";
import { AgentConversationColumn } from "../AgentConversationColumn";

jest.mock(
  "@/features/agents/redux/execution-system/thunks/load-older-messages.thunk",
  () => ({
    loadOlderMessages: jest.fn(() => ({ type: "test/history-request" })),
  }),
);

jest.mock("../../messages-display/AgentConversationDisplay", () => ({
  AgentConversationDisplay: () => <div style={{ height: 800 }} />,
}));
jest.mock("../../inputs/smart-input/SmartAgentInput", () => ({
  SmartAgentInput: () => <textarea aria-label="Message" />,
}));
jest.mock("@/features/agents/runtime-reconnect/ServerOperationBanner", () => ({
  ServerOperationBanner: () => null,
}));
jest.mock("@/features/agents/ui-first-tools/ui/PendingAsksZone", () => ({
  PendingAsksZone: () => null,
}));
jest.mock(
  "@/features/matrx-envelope/components/ProposedDirectivesZone",
  () => ({
    ProposedDirectivesZone: () => null,
  }),
);

const conversationId = "cold-history";
const activeResizeObservers = new Set<() => void>();

function page(): MessageRecord[] {
  return Array.from({ length: 4 }, (_, index) => ({
    id: `message-${index}`,
    conversationId,
    agentId: null,
    role: index % 2 === 0 ? "user" : "assistant",
    content: [{ type: "text", content: `Saved message ${index}` }],
    contentHistory: null,
    userContent: null,
    position: index,
    source: "user",
    status: "active",
    isVisibleToModel: true,
    isVisibleToUser: true,
    metadata: {},
    createdAt: "2026-09-10T20:21:44Z",
    deletedAt: null,
    _clientStatus: "complete",
  }));
}

describe("AgentConversationColumn cold history anchoring", () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrollTo: jest.Mock;
  let scrollHeightDescriptor: PropertyDescriptor | undefined;
  let clientHeightDescriptor: PropertyDescriptor | undefined;
  let scrollToDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    jest.useFakeTimers();
    jest.mocked(loadOlderMessages).mockClear();
    activeResizeObservers.clear();
    scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    );
    clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientHeight",
    );
    scrollToDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollTo",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return this.classList.contains("overflow-y-auto") ? 1000 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return this.classList.contains("overflow-y-auto") ? 400 : 0;
      },
    });
    scrollTo = jest.fn(function (this: HTMLElement, options: ScrollToOptions) {
      this.scrollTop = options.top ?? 0;
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: class {
        private readonly callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }

        observe() {
          activeResizeObservers.add(this.fire);
        }

        disconnect() {
          activeResizeObservers.delete(this.fire);
        }

        unobserve() {}

        private fire = () =>
          this.callback([], this as unknown as ResizeObserver);
      },
    });
    class IntersectionObserverMock {
      constructor(private readonly callback: IntersectionObserverCallback) {}

      observe(target: Element) {
        this.callback(
          [
            {
              isIntersecting: false,
              target,
              intersectionRatio: 0,
              boundingClientRect: new DOMRect(),
              intersectionRect: new DOMRect(),
              rootBounds: null,
              time: 0,
            },
          ],
          this as unknown as IntersectionObserver,
        );
      }

      disconnect() {}

      takeRecords() {
        return [];
      }

      unobserve() {}
    }
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: IntersectionObserverMock,
    });
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      value: IntersectionObserverMock,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
    if (scrollHeightDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollHeight",
        scrollHeightDescriptor,
      );
    }
    if (clientHeightDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        "clientHeight",
        clientHeightDescriptor,
      );
    }
    if (scrollToDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollTo",
        scrollToDescriptor,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
    }
  });

  it("keeps a cold transcript at newest through delayed growth until the user reads upward", () => {
    const store = configureStore({
      reducer: { messages, conversations, creatorDebug },
    });
    store.dispatch(
      hydrateMessages({
        conversationId,
        messages: page(),
        pagination: { oldestPosition: 0, hasMoreOlder: true },
      }),
    );

    act(() => {
      root.render(
        <Provider store={store}>
          <AgentConversationColumn
            conversationId={conversationId}
            surfaceKey="chat"
            deferColdMarkdown
          />
        </Provider>,
      );
    });

    const scrollEl = container.querySelector(".overflow-y-auto");
    expect(scrollEl).not.toBeNull();
    expect(container.querySelector("textarea")?.hasAttribute("disabled")).toBe(
      false,
    );
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000 });

    act(() => {
      jest.advanceTimersByTime(200);
    });
    const callsBeforeDelayedGrowth = scrollTo.mock.calls.length;
    // The old 4.8s unlock released the ResizeObserver before this growth.
    act(() => {
      jest.advanceTimersByTime(5000);
      for (const observer of activeResizeObservers) observer();
    });
    expect(scrollTo.mock.calls.length).toBeGreaterThan(
      callsBeforeDelayedGrowth,
    );
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000 });
    expect(loadOlderMessages).not.toHaveBeenCalled();

    const callsBeforeDownwardGrowth = scrollTo.mock.calls.length;
    act(() => {
      scrollEl?.dispatchEvent(new WheelEvent("wheel", { deltaY: 120 }));
      for (const observer of activeResizeObservers) observer();
    });
    expect(scrollTo.mock.calls.length).toBeGreaterThan(
      callsBeforeDownwardGrowth,
    );
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000 });

    act(() => {
      scrollEl?.dispatchEvent(new WheelEvent("wheel", { deltaY: -120 }));
    });
    const callsBeforeReleasedGrowth = scrollTo.mock.calls.length;
    act(() => {
      for (const observer of activeResizeObservers) observer();
    });
    expect(scrollTo).toHaveBeenCalledTimes(callsBeforeReleasedGrowth);
  });
});
