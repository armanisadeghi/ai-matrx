// The facet axis: 255 values, 30 of them useful, and a cap that never refuses.

import {
  buildFacetAxis,
  facetAxisPositions,
  FACET_AXIS_LAYOUT,
  FACET_AXIS_MORE_ID,
} from "./facetAxis";
import { buildTopicWorld, groupedWorld, mapGraphResult } from "./__fixtures__/mapGraph";
import { buildGraphModel, visibleTopicIds } from "./model";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  // A PARTIAL MOCK OF A REAL MODULE DIES ON THE NEXT EXPORT (DD-239): spread
  // the real store so a new export can never take this suite down at import.
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(() => "captured"),
}));

function axisOf(shown: number, valuesWithEdges = 30) {
  const model = buildGraphModel(groupedWorld(40, valuesWithEdges));
  const visible = visibleTopicIds(model, null);
  return { model, visible, axis: buildFacetAxis(model, visible, shown) };
}

describe("buildFacetAxis", () => {
  it("counts every value map_graph returned, shown or not", () => {
    const { axis } = axisOf(12);
    expect(axis.totalCount).toBe(256); // 255 regions plus the synthetic `all`
    expect(axis.values).toHaveLength(12);
    expect(axis.hiddenCount).toBe(244);
    expect(axis.facet).toBe("region");
  });

  it("carries the right remainder as more values are revealed", () => {
    expect(axisOf(12).axis.hiddenCount).toBe(244);
    expect(axisOf(24).axis.hiddenCount).toBe(232);
    expect(axisOf(256).axis.hiddenCount).toBe(0);
    expect(axisOf(500).axis.hiddenCount).toBe(0);
  });

  it("reports how many values touch no visible topic", () => {
    // 30 values carry an edge and `all` carries the other ten topics, so 225
    // regions are in the org and used by nothing in this drawing. That is the
    // fact the axis exists to keep out of the tree.
    const { axis } = axisOf(256);
    expect(axis.unusedCount).toBe(225);
  });

  it("leads with the `all` bucket when it has edges", () => {
    const { axis } = axisOf(12);
    expect(axis.values[0].isAll).toBe(true);
    expect(axis.values[0].topicIds).toHaveLength(10);
  });

  it("does not lead with the `all` bucket when it has none", () => {
    // Every topic on its own value: the bucket has nothing to say.
    const { axis } = axisOf(12, 40);
    expect(axis.values[0].isAll).toBe(false);
    expect(axis.values.some((value) => value.isAll)).toBe(false);
  });

  it("sorts values with no visible edge last", () => {
    const { axis } = axisOf(256);
    const firstEmpty = axis.values.findIndex((value) => value.topicIds.length === 0);
    const lastUsed = axis.values.map((value) => value.topicIds.length > 0).lastIndexOf(true);
    expect(firstEmpty).toBeGreaterThan(lastUsed);
    // …and the tail is alphabetical among the empties.
    const emptyNames = axis.values.filter((v) => v.topicIds.length === 0).map((v) => v.name);
    expect([...emptyNames].sort((a, b) => a.localeCompare(b))).toEqual(emptyNames);
  });

  it("narrows to the focused branch — a value loses the topics that left the view", () => {
    const model = buildGraphModel(groupedWorld(40, 30));
    const focused = visibleTopicIds(model, "topic-2");
    const axis = buildFacetAxis(model, focused, 256);
    const connected = axis.values.reduce((sum, value) => sum + value.topicIds.length, 0);
    expect(connected).toBe(focused.size);
    expect(connected).toBeLessThan(40);
  });

  it("carries each value's door — a resolved ref or a hidden one, never invented", () => {
    const { axis } = axisOf(256);
    const resolved = axis.values.find((value) => value.ref && !("hidden" in value.ref));
    const hidden = axis.values.find((value) => value.ref && "hidden" in value.ref);
    expect(resolved).toBeDefined();
    expect(hidden).toBeDefined();
    // The synthetic bucket names no entity and must not pretend to.
    expect(axis.values.find((value) => value.isAll)?.ref).toBeNull();
  });

  it("is empty when the drawing is not grouped", () => {
    const world = buildTopicWorld(40);
    const ungrouped = buildGraphModel(mapGraphResult(world.nodes, world.edges));
    const axis = buildFacetAxis(ungrouped, visibleTopicIds(ungrouped, null), 12);
    expect(axis.values).toEqual([]);
    expect(axis.totalCount).toBe(0);
    expect(axis.facet).toBeNull();
  });
});

describe("facetAxisPositions", () => {
  it("puts one column to the LEFT of the topic drawing", () => {
    const { axis } = axisOf(12);
    const positions = facetAxisPositions(axis, {
      ...FACET_AXIS_LAYOUT,
      topicsLeft: 1000,
      topicsTop: 200,
    });
    const xs = [...positions.values()].map((position) => position.x);
    expect(new Set(xs).size).toBe(1);
    expect(xs[0]).toBeLessThan(1000);
    expect(positions.get(axis.values[0].id)).toEqual({
      x: 1000 - FACET_AXIS_LAYOUT.gutter - FACET_AXIS_LAYOUT.width,
      y: 200,
    });
  });

  it("puts the +N more node under the last pill, and only when there is one", () => {
    const capped = axisOf(12).axis;
    const whole = axisOf(256).axis;
    const options = { ...FACET_AXIS_LAYOUT, topicsLeft: 0, topicsTop: 0 };
    expect(facetAxisPositions(capped, options).has(FACET_AXIS_MORE_ID)).toBe(true);
    expect(facetAxisPositions(whole, options).has(FACET_AXIS_MORE_ID)).toBe(false);
  });
});
