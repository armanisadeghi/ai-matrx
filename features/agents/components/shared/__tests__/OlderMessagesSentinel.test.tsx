import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import messages, {
  hydrateMessages,
  prependMessages,
  setOlderLoading,
  type MessageRecord,
} from "@/features/agents/redux/execution-system/messages/messages.slice";
import { loadOlderMessages } from "@/features/agents/redux/execution-system/thunks/load-older-messages.thunk";
import { OlderMessagesSentinel } from "../OlderMessagesSentinel";

// Only the fetch boundary is replaced. Real selectors, grouping, reducers,
// effects and event listeners must schedule each subsequent history request.
jest.mock("@/features/agents/redux/execution-system/thunks/load-older-messages.thunk", () => ({
  loadOlderMessages: jest.fn(() => ({ type: "test/history-request" })),
}));

const conversationId = "history-pagination";
function page(start: number, end: number): MessageRecord[] {
  return Array.from({ length: end - start }, (_, index) => {
    const position = start + index;
    return {
      id: `message-${position}`, conversationId, agentId: null,
      role: position === 0 ? "user" : position % 2 ? "assistant" : "tool",
      content: [{ type: "text", content: `Message ${position}` }],
      contentHistory: null, userContent: null, position, source: "user",
      status: "active", isVisibleToModel: true, isVisibleToUser: true,
      metadata: {}, createdAt: "2026-09-08T20:21:44Z", deletedAt: null,
      _clientStatus: "complete",
    };
  });
}

describe("OlderMessagesSentinel automatic fetching", () => {
  let root: Root;
  let container: HTMLDivElement;
  let scrollRef: ReturnType<typeof createRef<HTMLDivElement>>;
  let store: ReturnType<typeof makeStore>;
  let intersect: () => void;
  const makeStore = () => configureStore({ reducer: { messages } });

  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
    jest.useFakeTimers();
    jest.mocked(loadOlderMessages).mockClear();
    store = makeStore();
    store.dispatch(hydrateMessages({ conversationId, messages: page(28, 40),
      pagination: { oldestPosition: 28, hasMoreOlder: true } }));
    container = document.createElement("div");
    document.body.appendChild(container);
    scrollRef = createRef<HTMLDivElement>();
    scrollRef.current = document.createElement("div");
    Object.defineProperty(scrollRef.current, "scrollHeight", { configurable: true, value: 2800 });
    scrollRef.current.scrollTop = 500;
    root = createRoot(container);
    Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, value: class implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "200px 0px 0px 0px";
      readonly scrollMargin = "0px";
      readonly thresholds = [0];
      constructor(callback: IntersectionObserverCallback) {
        intersect = () => callback([{
          isIntersecting: true, target: container, intersectionRatio: 1,
          boundingClientRect: new DOMRect(), intersectionRect: new DOMRect(),
          rootBounds: null, time: 0,
        }], this);
      }
      observe() {} disconnect() {} unobserve() {} takeRecords() { return []; }
    } });
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });
  function render(disabled = false) {
    act(() => root.render(<Provider store={store}><OlderMessagesSentinel
      conversationId={conversationId} scrollRef={scrollRef} pageSize={8} disabled={disabled}
    /></Provider>));
  }
  function frame() { act(() => { jest.advanceTimersByTime(20); }); }
  function reachTop() {
    scrollRef.current!.scrollTop = 0;
    act(() => intersect());
  }
  function land(start: number, end: number) {
    act(() => { store.dispatch(setOlderLoading({ conversationId, loading: true })); });
    act(() => { store.dispatch(prependMessages({ conversationId, messages: page(start, end),
      pagination: { oldestPosition: start, hasMoreOlder: start > 0 } })); });
    frame();
  }

  it("continues through collapsed assistant batches at the top without another scroll event", () => {
    render(); frame();
    expect(loadOlderMessages).not.toHaveBeenCalled();
    reachTop();
    expect(loadOlderMessages).toHaveBeenCalledTimes(1);
    land(20, 28);
    expect(loadOlderMessages).toHaveBeenCalledTimes(2);
    land(12, 20);
    expect(loadOlderMessages).toHaveBeenCalledTimes(3);
    land(4, 12);
    expect(loadOlderMessages).toHaveBeenCalledTimes(4);
    land(0, 4); frame();
    expect(loadOlderMessages).toHaveBeenCalledTimes(4);
  });

  it("stops fetching if the user leaves the top while a page is loading", () => {
    render(); reachTop();
    scrollRef.current!.scrollTop = 700;
    land(20, 28);
    expect(loadOlderMessages).toHaveBeenCalledTimes(1);
  });

  it("resumes when the cold-history lock opens with the sentinel already at the top", () => {
    render(true); reachTop(); frame();
    expect(loadOlderMessages).not.toHaveBeenCalled();
    render(false); frame();
    expect(loadOlderMessages).toHaveBeenCalledTimes(1);
  });

  it("does not turn a failed page into an automatic retry loop", () => {
    render(); frame(); reachTop();
    act(() => { store.dispatch(setOlderLoading({ conversationId, loading: true })); });
    act(() => { store.dispatch(setOlderLoading({ conversationId, loading: false })); });
    frame(); frame();
    expect(loadOlderMessages).toHaveBeenCalledTimes(1);
  });

  it("preserves the anchor and stops when visible prepended content moves the top out of range", () => {
    render(); frame(); reachTop();
    Object.defineProperty(scrollRef.current, "scrollHeight", { configurable: true, value: 3400 });
    land(20, 28);
    expect(scrollRef.current!.scrollTop).toBe(600);
    expect(loadOlderMessages).toHaveBeenCalledTimes(1);
  });

  it("does not overlap requests when scroll, intersection and the progress frame coincide", () => {
    render(); reachTop();
    act(() => { scrollRef.current!.dispatchEvent(new Event("scroll")); intersect(); });
    frame();
    expect(loadOlderMessages).toHaveBeenCalledTimes(1);
  });
});
