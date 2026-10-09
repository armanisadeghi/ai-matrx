import { addVital, isSampled, loadIsSampled, readStoredRate, RATE_STORAGE_KEY, writeStoredRate, routeTemplate, sampleRateOf, type VitalName, type VitalSample } from "./vitals";

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
