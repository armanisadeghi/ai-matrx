// Where the topics sit: a stored arrangement is never overwritten, and an
// unplaced topic is never stacked at the origin.

import { buildFacetAxis, facetAxisPositions, FACET_AXIS_LAYOUT } from "./facetAxis";
import { GRAPH_BAND_GEOMETRY } from "./bands";
import { buildTopicWorld, groupedWorld, mapGraphResult } from "./__fixtures__/mapGraph";
import { autoArrangeTopics, layoutTopics, topLeftOf, type TopicLayoutInput } from "./layout";
import { buildGraphModel, visibleTopicIds, visibleTopics, visibleTreeEdges } from "./model";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: jest.fn(() => "captured"),
}));

const GEOMETRY = GRAPH_BAND_GEOMETRY.compact;

/** Eight topics: three of them arranged by hand, five never placed. */
function world() {
  const built = buildTopicWorld(8, {
    2: { index: 2, parentIndex: 1, layout: { x: 100, y: 100 } },
    3: { index: 3, parentIndex: 1, layout: { x: 340, y: 100 } },
    4: { index: 4, parentIndex: 2, layout: { x: 100, y: 260 } },
  });
  const model = buildGraphModel(mapGraphResult(built.nodes, built.edges));
  const visible = visibleTopicIds(model, null);
  return { model, visible };
}

function inputFor(autoLayout: boolean): TopicLayoutInput {
  const { model, visible } = world();
  return {
    topics: visibleTopics(model, visible),
    treeEdges: visibleTreeEdges(model, visible),
    width: GEOMETRY.width,
    height: GEOMETRY.height,
    nodeSep: GEOMETRY.nodeSep,
    rankSep: GEOMETRY.rankSep,
    autoLayout,
  };
}

describe.each([true, false])("layoutTopics with graph_auto_layout = %s", (autoLayout) => {
  const input = inputFor(autoLayout);
  const positions = layoutTopics(input);

  it("places every visible topic", () => {
    expect(positions.size).toBe(input.topics.length);
  });

  it("keeps a stored layout exactly as the person left it", () => {
    for (const topic of input.topics) {
      if (topic.data.auto_layout === false) {
        expect(positions.get(topic.id)).toEqual(topic.position);
      }
    }
  });

  it("never stacks the unplaced topics at the origin", () => {
    const unplaced = input.topics.filter((topic) => topic.data.auto_layout);
    const seen = new Set(
      unplaced.map((topic) => {
        const position = positions.get(topic.id);
        return `${position?.x},${position?.y}`;
      }),
    );
    expect(unplaced.length).toBeGreaterThan(1);
    expect(seen.size).toBe(unplaced.length);
    expect(seen.has("0,0")).toBe(false);
  });
});

describe("the knob is read, not assumed", () => {
  it("keeps the arrivals clear of the hand-arranged cluster when it is off", () => {
    const input = inputFor(false);
    const positions = layoutTopics(input);
    const placedRight = Math.max(
      ...input.topics
        .filter((topic) => topic.data.auto_layout === false)
        .map((topic) => topic.position.x + input.width),
    );
    for (const topic of input.topics) {
      if (topic.data.auto_layout) {
        expect(positions.get(topic.id)?.x ?? 0).toBeGreaterThanOrEqual(placedRight);
      }
    }
  });

  it("flows the arrivals through the whole tree when it is on", () => {
    const on = layoutTopics(inputFor(true));
    const off = layoutTopics(inputFor(false));
    const input = inputFor(true);
    const unplaced = input.topics.filter((topic) => topic.data.auto_layout);
    // Same topics, different answers — the two states are not one code path
    // with a parameter nobody reads.
    expect(unplaced.some((topic) => on.get(topic.id)?.x !== off.get(topic.id)?.x)).toBe(true);
  });
});

describe("autoArrangeTopics", () => {
  it("re-lays EVERY visible topic, stored layouts included", () => {
    const input = inputFor(true);
    const arranged = autoArrangeTopics(input);
    expect(arranged.size).toBe(input.topics.length);
    const moved = input.topics.filter(
      (topic) =>
        topic.data.auto_layout === false &&
        (arranged.get(topic.id)?.x !== topic.position.x ||
          arranged.get(topic.id)?.y !== topic.position.y),
    );
    expect(moved.length).toBeGreaterThan(0);
  });
});

describe("a facet position never reaches a topic", () => {
  it("computes the axis from the topics' own corner and writes nothing back", () => {
    const model = buildGraphModel(groupedWorld(40, 30));
    const visible = visibleTopicIds(model, null);
    const topics = visibleTopics(model, visible);
    const before = topics.map((topic) => ({ ...topic.position }));

    const positions = layoutTopics({
      topics,
      treeEdges: visibleTreeEdges(model, visible),
      width: GEOMETRY.width,
      height: GEOMETRY.height,
      nodeSep: GEOMETRY.nodeSep,
      rankSep: GEOMETRY.rankSep,
      autoLayout: true,
    });
    const corner = topLeftOf(positions.values());
    const axis = buildFacetAxis(model, visible, 12);
    const axisPositions = facetAxisPositions(axis, {
      ...FACET_AXIS_LAYOUT,
      topicsLeft: corner.x,
      topicsTop: corner.y,
    });

    // The two maps are keyed by different ids and share none.
    for (const id of axisPositions.keys()) {
      expect(positions.has(id)).toBe(false);
    }
    // The graph document itself is untouched: nothing was persisted anywhere.
    expect(topics.map((topic) => ({ ...topic.position }))).toEqual(before);
  });
});


describe("company root", () => {
  it("lays every topic below the same company in the graph hierarchy", () => {
    const input = { ...inputFor(true), companyRootId: "company" };
    const positions = autoArrangeTopics(input);
    const company = positions.get("company")!;
    const children = new Set(input.treeEdges.map(edge => edge.target));
    expect(positions.size).toBe(input.topics.length + 1);
    for (const topic of input.topics.filter(topic => !children.has(topic.id))) {
      expect(positions.get(topic.id)!.x).toBeGreaterThan(company.x + 240);
    }
  });

  it.each([true, false])("keeps stored topics intact with a company anchor (auto=%s)", autoLayout => {
    const input = { ...inputFor(autoLayout), companyRootId: "company" };
    const positions = layoutTopics(input);
    expect(positions.has("company")).toBe(true);
    for (const topic of input.topics.filter(topic => !topic.data.auto_layout)) {
      expect(positions.get(topic.id)).toEqual(topic.position);
      expect(positions.get("company")!.x + 240).toBeLessThan(topic.position.x);
    }
  });
});


it("keeps the company left of mixed stored and automatically placed topics", () => {
  const input = { ...inputFor(true), companyRootId: "company" };
  input.topics = input.topics.map(topic => topic.data.auto_layout ? topic : {
    ...topic, position: { x: topic.position.x + 1000, y: topic.position.y },
  });
  const positions = layoutTopics(input);
  for (const topic of input.topics) {
    expect(positions.get("company")!.x + 240).toBeLessThan(positions.get(topic.id)!.x);
  }
});
