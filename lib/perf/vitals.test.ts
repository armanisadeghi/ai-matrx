import { addVital, isSampled, routeTemplate, sampleRateOf, type VitalName, type VitalSample } from "./vitals";

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
