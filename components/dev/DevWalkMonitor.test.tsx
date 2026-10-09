/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DevWalkMonitor, installDevWalkMonitor } from "./DevWalkMonitor";

class FakeEventSource {
  static instance: FakeEventSource | null = null;
  closed = false;
  private listeners = new Map<string, EventListener>();
  constructor(readonly url: string) { FakeEventSource.instance = this; }
  addEventListener(type: string, listener: EventListener) { this.listeners.set(type, listener); }
  removeEventListener(type: string) { this.listeners.delete(type); }
  close() { this.closed = true; }
  emit(type: string) { this.listeners.get(type)?.(new Event(type)); }
}

describe("DevWalkMonitor", () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleError: jest.SpyInstance;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.replaceProperty(process, "env", { ...originalEnv, NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "https://db.matrxserver.com" });
    Object.defineProperty(window, "EventSource", { configurable: true, value: FakeEventSource });
    FakeEventSource.instance = null;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    global.fetch = jest.fn(async () => new Response(null, { status: 204 }));
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    consoleError.mockRestore();
    jest.replaceProperty(process, "env", originalEnv);
  });

  it("parks on eviction, captures nested scroll activity, and cleans up", async () => {
    await act(async () => root.render(<DevWalkMonitor />));
    const nestedScrollArea = document.createElement("div");
    document.body.append(nestedScrollArea);
    await act(async () => nestedScrollArea.dispatchEvent(new Event("scroll", { bubbles: false })));
    expect(global.fetch).toHaveBeenCalledWith("/__dev-walk?activity=1", expect.objectContaining({ method: "POST" }));
    act(() => FakeEventSource.instance?.emit("evicted"));
    expect(FakeEventSource.instance?.closed).toBe(true);
    nestedScrollArea.remove();
  });

  it("announces itself before it leaves: the console and the document say the preview was paused, not that the app failed", () => {
    // FIRST-PAGE-ABORT (2026-10-08): a walker whose host the cap evicted mid-load saw only React's
    // "Transition was aborted because of invalid state" and a skeleton with no rows, and read it as a
    // table-page fault. Eviction is the cause; the page must say so before it unloads.
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const park = jest.fn();
    const stop = installDevWalkMonitor({ window, EventSource: FakeEventSource as unknown as typeof EventSource, fetch: jest.fn(), park });
    FakeEventSource.instance?.emit("evicted");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[walk-cap]"));
    expect(warn.mock.calls.flat().join(" ")).toMatch(/paused|evicted/i);
    expect(document.documentElement.getAttribute("data-matrx-walk-parked")).toBe("evicted");
    expect(park).toHaveBeenCalled();
    stop();
    warn.mockRestore();
    document.documentElement.removeAttribute("data-matrx-walk-parked");
  });

  it("stays inert on clone configuration", async () => {
    jest.replaceProperty(process, "env", { ...originalEnv, NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "https://clone.example" });
    await act(async () => root.render(<DevWalkMonitor />));
    expect(FakeEventSource.instance).toBeNull();
  });

  it("uses the injected park target on eviction and does not park an unknown activity result", async () => {
    const park = jest.fn();
    const fetchUnknown = jest.fn(async () => new Response(null, { status: 204 }));
    const stop = installDevWalkMonitor({ window, EventSource: FakeEventSource as unknown as typeof EventSource, fetch: fetchUnknown, park });
    const nestedScrollArea = document.createElement("div");
    document.body.append(nestedScrollArea);
    nestedScrollArea.dispatchEvent(new Event("scroll", { bubbles: false }));
    await Promise.resolve();
    expect(park).not.toHaveBeenCalled();
    FakeEventSource.instance?.emit("evicted");
    expect(park).toHaveBeenCalledWith(expect.stringContaining("/__dev-walk?parked=1"));
    stop();
    nestedScrollArea.remove();
  });

  it("parks when an activity response carries the eviction header", async () => {
    const park = jest.fn();
    const fetchEvicted = jest.fn(async () => new Response(null, { status: 409, headers: { "x-matrx-walk-cap": "evicted" } }));
    const stop = installDevWalkMonitor({ window, EventSource: FakeEventSource as unknown as typeof EventSource, fetch: fetchEvicted, park });
    window.dispatchEvent(new Event("pointerdown"));
    await Promise.resolve();
    expect(park).toHaveBeenCalledWith(expect.stringContaining("/__dev-walk?parked=1"));
    stop();
  });
});
