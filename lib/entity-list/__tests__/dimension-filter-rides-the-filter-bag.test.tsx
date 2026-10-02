/**
 * The Dimension filter (lane 3 INTEGRATION, W1.5) lives in the query's one filter bag under
 * `__dimension`, so it reaches every list RPC's `p_filters` and the URL with no service change, and
 * the chips row never repeats it (the control on the lane row is its visible state).
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { DIMENSION_FILTER_KEY, dimensionValueOf, withDimensionValue } from "../dimensionFilter";
import { EntityFilterChips } from "../components/EntityFilterChips";
import { queryToParamPatch, readQueryFromParams } from "../urlQuery";
import { DEFAULT_ENTITY_LIST_QUERY } from "../types";

describe("the Dimension filter rides the filter bag", () => {
  it("sets, reads and clears one Value without touching other filters", () => {
    const base = { category: { kind: "select" as const, values: ["Intake"] } };
    const set = withDimensionValue(base, "scope-sports-rehab");
    expect(set[DIMENSION_FILTER_KEY]).toEqual({ kind: "select", values: ["scope-sports-rehab"] });
    expect(set.category).toEqual(base.category);
    expect(dimensionValueOf(set)).toBe("scope-sports-rehab");
    expect(dimensionValueOf(withDimensionValue(set, null))).toBeNull();
    expect(base).not.toHaveProperty(DIMENSION_FILTER_KEY);
  });

  it("survives the URL round trip (a pasted link reproduces the narrowing)", () => {
    const q = { ...DEFAULT_ENTITY_LIST_QUERY, filters: withDimensionValue({}, "scope-sports-rehab") };
    const patch = queryToParamPatch(q, DEFAULT_ENTITY_LIST_QUERY);
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(patch)) if (v !== null) params.set(k, v);
    const back = readQueryFromParams(new URLSearchParams(params.toString()), DEFAULT_ENTITY_LIST_QUERY);
    expect(dimensionValueOf(back.filters)).toBe("scope-sports-rehab");
  });

  it("gets no chip of its own", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        React.createElement(EntityFilterChips, {
          columns: [],
          filters: withDimensionValue({ name: { kind: "text", value: "intake" } }, "scope-sports-rehab"),
          onFiltersChange: () => {},
        }),
      );
    });
    // The other filter still gets its chip; the Dimension does not.
    expect(container.querySelectorAll("[data-entity-filter-chip]")).toHaveLength(1);
    act(() => root.unmount());
  });
});
