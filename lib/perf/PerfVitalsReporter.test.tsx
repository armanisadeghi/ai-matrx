/** @jest-environment jsdom */
// An unsampled page load must do exactly one cheap random draw: no observers, no settings read,
// no auth call. A sampled load does the full job. (performance-watch PLAN §2)
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

const useReportWebVitals = jest.fn();
const resolveSessionKnob = jest.fn(() => Promise.resolve(undefined));
const getSession = jest.fn(() => Promise.resolve({ data: { session: null } }));
const onAuthStateChange = jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } }));

jest.mock("next/web-vitals", () => ({ useReportWebVitals: (cb: unknown) => useReportWebVitals(cb) }));
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

async function mountWithDraw(draw: number, stored?: string, routes?: Record<string, number>, path = "/"): Promise<void> {
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
    root.unmount();
  });
}

beforeEach(() => {
  useReportWebVitals.mockClear();
  resolveSessionKnob.mockClear();
  getSession.mockClear();
  onAuthStateChange.mockClear();
});
afterEach(() => jest.restoreAllMocks());

describe("PerfVitalsReporter", () => {
  it("an unsampled load registers no observer and reads nothing", async () => {
    await mountWithDraw(0.9);
    expect(useReportWebVitals).not.toHaveBeenCalled();
    expect(resolveSessionKnob).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(onAuthStateChange).not.toHaveBeenCalled();
  });

  it("a load unsampled by a stored rate of 0 does nothing either", async () => {
    await mountWithDraw(0.001, "0");
    expect(useReportWebVitals).not.toHaveBeenCalled();
    expect(resolveSessionKnob).not.toHaveBeenCalled();
  });

  it("a sampled load registers the observer and resolves the two knobs (rate, per-route map) once each", async () => {
    await mountWithDraw(0.01);
    expect(useReportWebVitals).toHaveBeenCalled();
    expect(resolveSessionKnob).toHaveBeenCalledTimes(2);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("a stored rate raised by an earlier sampled load lets more loads in", async () => {
    await mountWithDraw(0.4, "0.5");
    expect(useReportWebVitals).toHaveBeenCalled();
  });

  it("a quiet route in the stored per-route map is sampled at its own rate; other routes keep the global one", async () => {
    await mountWithDraw(0.9, "0.05", { "/meetings": 1 }, "/meetings");
    expect(useReportWebVitals).toHaveBeenCalled();
    useReportWebVitals.mockClear();
    await mountWithDraw(0.9, "0.05", { "/meetings": 1 }, "/hr");
    expect(useReportWebVitals).not.toHaveBeenCalled();
    expect(resolveSessionKnob).toHaveBeenCalledTimes(2); // only the first (sampled) mount resolved knobs
  });
});
