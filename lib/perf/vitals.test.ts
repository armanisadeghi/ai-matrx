import { addVital, effectiveRate, isSampled, loadIsSampled, readStoredRouteRates, ROUTE_RATES_STORAGE_KEY, routeRateFor, routeRatesOf, writeStoredRouteRates, readStoredRate, RATE_STORAGE_KEY, writeStoredRate, routeTemplate, sampleRateOf, type VitalName, type VitalSample } from "./vitals";

describe("routeTemplate", () => {
  it("names dynamic params instead of their values", () => {
    expect(routeTemplate("/tables/7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd/records/42", { tableId: "7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd", recordId: "42" }))
      .toBe("/tables/[tableId]/records/[recordId]");
  });
  it("collapses a catch-all to one segment", () => {
    expect(routeTemplate("/docs/a/b/c", { slug: ["a", "b", "c"] })).toBe("/docs/[...slug]");
  });
  it("never keeps a raw id the params do not describe, nor the query or hash", () => {
    expect(routeTemplate("/x/0b1c2d3e-0000-4000-8000-000000000001/123456?tab=1#top", {})).toBe("/x/[id]/[n]");
  });
  it("keeps static routes", () => {
    expect(routeTemplate("/administration/reporting/performance", {})).toBe("/administration/reporting/performance");
    expect(routeTemplate("/", null)).toBe("/");
  });
});

describe("sampling", () => {
  it("0 is off, 1 is every load, the knob default until it answers", () => {
    expect(isSampled(0, 0)).toBe(false);
    expect(isSampled(0.999, 1)).toBe(true);
    expect(isSampled(0.04, sampleRateOf(undefined))).toBe(true);
    expect(isSampled(0.06, sampleRateOf(undefined))).toBe(false);
    expect(sampleRateOf("0.5")).toBe(0.5);
    expect(sampleRateOf(7)).toBe(1);
  });
});

describe("addVital", () => {
  it("keeps the first LCP, the latest CLS, and drops unknown names and soft navigations", () => {
    const b = new Map<VitalName, VitalSample>();
    addVital(b, { name: "LCP", value: 1200 }, "/a");
    addVital(b, { name: "LCP", value: 9000 }, "/a");
    addVital(b, { name: "CLS", value: 0.01 }, "/a");
    addVital(b, { name: "CLS", value: 0.05 }, "/a");
    addVital(b, { name: "FID", value: 3 }, "/a");
    addVital(b, { name: "TTFB", value: 80, navigationType: "soft-navigation" }, "/b");
    expect([...b.values()].map((s) => [s.name, s.value])).toEqual([["LCP", 1200], ["CLS", 0.05]]);
  });
});

describe("the stored rate", () => {
  const store = (v: string | null) => ({ getItem: (k: string) => (k === RATE_STORAGE_KEY ? v : null) });
  it("is the platform default until a sampled load has stored one", () => {
    expect(readStoredRate(null)).toBe(0.05);
    expect(readStoredRate(store(null))).toBe(0.05);
    expect(readStoredRate(store("0.25"))).toBe(0.25);
    expect(readStoredRate(store("junk"))).toBe(0.05);
  });
  it("never throws on a blocked store", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readStoredRate(blocked)).toBe(0.05);
    expect(() => writeStoredRate(blocked, 0.1)).not.toThrow();
  });
  it("decides a load with one draw", () => {
    expect(loadIsSampled(0.04, store(null))).toBe(true);
    expect(loadIsSampled(0.06, store(null))).toBe(false);
    expect(loadIsSampled(0.001, store("0"))).toBe(false);
  });
});

describe("per-route sample rates (quiet routes report every load)", () => {
  const store = (global: string | null, routes: string | null) => ({
    getItem: (k: string) => (k === RATE_STORAGE_KEY ? global : k === ROUTE_RATES_STORAGE_KEY ? routes : null),
  });
  const rates = { "/meetings": 1, "/data/[tableId]": 1, "/data/new": 0.2, "/docs/[...slug]": 0.5 };

  it("a route in the map is sampled at its own rate while every other route keeps the global rate", () => {
    const s = store("0.05", JSON.stringify(rates));
    expect(loadIsSampled(0.99, s, "/meetings")).toBe(true); // the old behaviour drew against 0.05 and said no
    expect(loadIsSampled(0.99, s, "/data/7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd")).toBe(true);
    expect(loadIsSampled(0.99, s, "/hr")).toBe(false);
    expect(loadIsSampled(0.04, s, "/hr")).toBe(true);
  });
  it("with no map, or no pathname, a load is decided by the global rate alone", () => {
    expect(loadIsSampled(0.99, store("0.05", null), "/meetings")).toBe(false);
    expect(loadIsSampled(0.99, store("0.05", JSON.stringify(rates)))).toBe(false);
    expect(loadIsSampled(0.99, store("0.05", "not json"), "/meetings")).toBe(false);
  });
  it("the most specific template wins and a catch-all takes the rest of the path", () => {
    expect(routeRateFor("/data/new", rates)).toBe(0.2);
    expect(routeRateFor("/data/abc", rates)).toBe(1);
    expect(routeRateFor("/docs/a/b/c", rates)).toBe(0.5);
    expect(routeRateFor("/docs", rates)).toBeNull();
    expect(routeRateFor("/meetings/", rates)).toBe(1);
    expect(routeRateFor("/meetings/extra", rates)).toBeNull();
    expect(effectiveRate("/hr", 0.05, rates)).toBe(0.05);
  });
  it("only well-formed entries survive, clamped to [0, 1]", () => {
    expect(routeRatesOf({ "/a": 2, "/b": "0.3", bad: 1, "/c": "x", "/d": -1 })).toEqual({ "/a": 1, "/b": 0.3, "/d": 0 });
    expect(routeRatesOf([1, 2])).toEqual({});
    expect(routeRatesOf(null)).toEqual({});
  });
  it("storage round-trips and never throws when blocked", () => {
    let kept = "";
    writeStoredRouteRates({ setItem: (_k, v) => { kept = v; } }, { "/a": 1 });
    expect(readStoredRouteRates({ getItem: () => kept })).toEqual({ "/a": 1 });
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readStoredRouteRates(blocked)).toEqual({});
    expect(() => writeStoredRouteRates(blocked, { "/a": 1 })).not.toThrow();
  });
});
