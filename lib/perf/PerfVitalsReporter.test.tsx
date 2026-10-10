/** @jest-environment jsdom */
// An unsampled page load must do exactly one cheap random draw: no observers, no settings read,
// no auth call. A sampled load does the full job. (performance-watch PLAN §2)
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

// web-vitals is mocked so each test finalizes metrics itself; a window-capture visibilitychange listener
// stands in for the library's own finalize-on-hidden handlers (they run before any document listener).
type Cb = (m: { name: string; value: number; navigationType?: string }) => void;
const callbacks: Record<string, Cb> = {};
const onLCP = jest.fn((cb: Cb) => { callbacks.LCP = cb; });
const onINP = jest.fn((cb: Cb) => { callbacks.INP = cb; });
const onCLS = jest.fn((cb: Cb) => { callbacks.CLS = cb; });
const onFCP = jest.fn((cb: Cb) => { callbacks.FCP = cb; });
const onTTFB = jest.fn((cb: Cb) => { callbacks.TTFB = cb; });
const observerRegistered = onLCP;
const fetchMock = jest.fn((_url?: unknown, _init?: unknown) => Promise.resolve({ ok: true }));
jest.mock("web-vitals", () => ({
  onLCP: (cb: Cb) => onLCP(cb), onINP: (cb: Cb) => onINP(cb), onCLS: (cb: Cb) => onCLS(cb),
  onFCP: (cb: Cb) => onFCP(cb), onTTFB: (cb: Cb) => onTTFB(cb),
}));
const resolveSessionKnob = jest.fn(() => Promise.resolve(undefined));
const getSession = jest.fn(() => Promise.resolve({ data: { session: null } }));
const onAuthStateChange = jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } }));

jest.mock("next/navigation", () => ({ usePathname: () => "/tables/abc", useParams: () => ({}) }));
jest.mock("@/lib/scoped-config/sessionKnob", () => ({
  resolveSessionKnob: () => resolveSessionKnob(),
  getSessionKnob: jest.fn(() => {
    throw new Error("an unsampled or sampled load must not read the cached knob on the hot path");
  }),
}));
jest.mock("@/utils/supabase/client", () => ({
  supabase: { auth: { getSession: () => getSession(), onAuthStateChange: () => onAuthStateChange() } },
}));

async function mountWithDraw(draw: number, stored?: string, routes?: Record<string, number>, path = "/", keepMounted = false): Promise<() => Promise<void>> {
  jest.resetModules();
  // One React for the test and the freshly imported module (a reset registry would load a second copy).
  jest.doMock("react", () => React);
  window.localStorage.clear();
  if (stored !== undefined) window.localStorage.setItem("matrx.perf.client_sample_rate", stored);
  if (routes) window.localStorage.setItem("matrx.perf.client_sample_rate_by_route", JSON.stringify(routes));
  window.history.pushState({}, "", path);
  jest.spyOn(Math, "random").mockReturnValue(draw);
  const { PerfVitalsReporter } = await import("./PerfVitalsReporter");
  const host = document.createElement("div");
  const root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await act(async () => {
    root.render(<PerfVitalsReporter />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30)); // web-vitals is loaded after idle
  });
  const unmount = async () => {
    await act(async () => {
      root.unmount();
    });
  };
  if (!keepMounted) await unmount();
  return unmount;
}

beforeEach(() => {
  observerRegistered.mockClear();
  resolveSessionKnob.mockClear();
  getSession.mockClear();
  onAuthStateChange.mockClear();
});
afterEach(() => jest.restoreAllMocks());

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}
function setNavigationEntries(entries: unknown[], visibility: unknown[] = []) {
  // jsdom has no getEntriesByType at all, so it is installed rather than spied on.
  Object.defineProperty(performance, "getEntriesByType", {
    configurable: true,
    value: (type: string) => (type === "navigation" ? entries : type === "visibility-state" ? visibility : []),
  });
}
const sentSamples = (): { name: string; value: number }[] =>
  fetchMock.mock.calls.flatMap(([, init]) => JSON.parse((init as { body: string }).body).p_samples);
// What a page leaving really does: `pagehide` first, then visibilitychange->hidden. web-vitals finalizes
// LCP / INP on that visibilitychange from a window-capture listener, which runs before the reporter's own.
function leavePage(finalize: () => void) {
  window.dispatchEvent(new Event("pagehide"));
  const onHiddenCapture = () => finalize();
  window.addEventListener("visibilitychange", onHiddenCapture, true);
  setVisibility("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  window.removeEventListener("visibilitychange", onHiddenCapture, true);
}

describe("PerfVitalsReporter delivery", () => {
  beforeEach(() => {
    for (const k of Object.keys(callbacks)) delete callbacks[k];
    fetchMock.mockClear();
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://sb.test";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "k";
    getSession.mockImplementation(() => Promise.resolve({ data: { session: { access_token: "t" } } }) as never);
    setVisibility("visible");
    setNavigationEntries([{ responseStart: 5, activationStart: 0, type: "navigate" }]);
  });
  afterEach(() => {
    getSession.mockImplementation(() => Promise.resolve({ data: { session: null } }) as never);
    setVisibility("visible");
  });

  it("LCP and INP finalized by web-vitals on the page leaving are delivered (pagehide fires first and must not flush early)", async () => {
    const unmount = await mountWithDraw(0.01, undefined, undefined, "/", true);
    callbacks.TTFB({ name: "TTFB", value: 5, navigationType: "navigate" });
    callbacks.FCP({ name: "FCP", value: 300, navigationType: "navigate" });
    leavePage(() => {
      callbacks.LCP({ name: "LCP", value: 1234, navigationType: "navigate" });
      callbacks.INP({ name: "INP", value: 88, navigationType: "navigate" });
      callbacks.CLS({ name: "CLS", value: 0.02, navigationType: "navigate" });
    });
    expect(sentSamples().map((s) => s.name).sort()).toEqual(["CLS", "FCP", "INP", "LCP", "TTFB"]);
    expect(sentSamples().find((s) => s.name === "LCP")?.value).toBe(1234);
    await unmount();
  });

  it("a load that started in a hidden tab sends nothing and loads no web-vitals", async () => {
    setVisibility("hidden");
    const unmount = await mountWithDraw(0.01, undefined, undefined, "/", true);
    expect(observerRegistered).not.toHaveBeenCalled();
    leavePage(() => undefined);
    expect(fetchMock).not.toHaveBeenCalled();
    await unmount();
  });

  it("a bfcache restore and a soft navigation are not kept; the first byte of a deferred request is dropped", async () => {
    setNavigationEntries([{ responseStart: 5, activationStart: 0 }], [{ name: "hidden", startTime: 100 }]);
    const unmount = await mountWithDraw(0.01, undefined, undefined, "/", true);
    callbacks.TTFB({ name: "TTFB", value: 226000, navigationType: "navigate" }); // arrived long after it was hidden
    callbacks.FCP({ name: "FCP", value: 50, navigationType: "navigate" });
    callbacks.LCP({ name: "LCP", value: 900, navigationType: "back-forward-cache" });
    callbacks.INP({ name: "INP", value: 40, navigationType: "soft-navigation" });
    leavePage(() => undefined);
    expect(sentSamples().map((s) => s.name)).toEqual(["FCP"]);
    await unmount();
  });
});

describe("TTFB comes from navigation timing (real web-vitals, no mock)", () => {
  it("is responseStart minus activationStart of the navigation entry", async () => {
    jest.resetModules();
    setNavigationEntries([{ responseStart: 60, activationStart: 20, type: "navigate" }]);
    jest.spyOn(performance, "now").mockReturnValue(500);
    const real = jest.requireActual("web-vitals") as typeof import("web-vitals");
    const got: { value: number; navigationType: string }[] = [];
    real.onTTFB((m) => got.push(m));
    await new Promise((r) => setTimeout(r, 30));
    expect(got).toHaveLength(1);
    expect(got[0].value).toBe(40);
  });
});

describe("PerfVitalsReporter", () => {
  it("an unsampled load registers no observer and reads nothing", async () => {
    await mountWithDraw(0.9);
    expect(observerRegistered).not.toHaveBeenCalled();
    expect(resolveSessionKnob).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(onAuthStateChange).not.toHaveBeenCalled();
  });

  it("a load unsampled by a stored rate of 0 does nothing either", async () => {
    await mountWithDraw(0.001, "0");
    expect(observerRegistered).not.toHaveBeenCalled();
    expect(resolveSessionKnob).not.toHaveBeenCalled();
  });

  it("a sampled load registers the observer and resolves the two knobs (rate, per-route map) once each", async () => {
    await mountWithDraw(0.01);
    expect(observerRegistered).toHaveBeenCalled();
    expect(resolveSessionKnob).toHaveBeenCalledTimes(2);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("a stored rate raised by an earlier sampled load lets more loads in", async () => {
    await mountWithDraw(0.4, "0.5");
    expect(observerRegistered).toHaveBeenCalled();
  });

  it("a quiet route in the stored per-route map is sampled at its own rate; other routes keep the global one", async () => {
    await mountWithDraw(0.9, "0.05", { "/meetings": 1 }, "/meetings");
    expect(observerRegistered).toHaveBeenCalled();
    observerRegistered.mockClear();
    await mountWithDraw(0.9, "0.05", { "/meetings": 1 }, "/hr");
    expect(observerRegistered).not.toHaveBeenCalled();
    expect(resolveSessionKnob).toHaveBeenCalledTimes(2); // only the first (sampled) mount resolved knobs
  });
});
