// Narrowing `seo.map_graph`'s document, and the focus walk.

import { captureError } from "@/lib/diagnostics/errorCaptureStore";

import type { MapGraphResult } from "../../types";
import { focusWorld, groupedWorld, mapGraphResult, world15 } from "./__fixtures__/mapGraph";
import { buildGraphModel, visibleTopicIds, visibleTreeEdges } from "./model";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: jest.fn(() => "captured"),
}));

const captureErrorMock = captureError as jest.MockedFunction<typeof captureError>;

beforeEach(() => {
  captureErrorMock.mockClear();
});

describe("buildGraphModel", () => {
  it("keeps map_graph's own order and indexes topics by id and slug", () => {
    const model = buildGraphModel(world15());
    expect(model.topics).toHaveLength(15);
    expect(model.topics[0].data.slug).toBe("topic-1");
    expect(model.topicBySlug.get("topic-3")?.id).toBe(model.topics[2].id);
    expect(model.topicById.get(model.topics[2].id)?.data.slug).toBe("topic-3");
    expect(model.skippedNodes).toBe(0);
    expect(model.skippedEdges).toBe(0);
  });

  it("separates facet values from topics and carries the grouped facet", () => {
    const model = buildGraphModel(groupedWorld());
    expect(model.topics).toHaveLength(40);
    // 255 real values plus the synthetic `all`.
    expect(model.facetValues).toHaveLength(256);
    expect(model.facetEdges).toHaveLength(40);
    expect(model.groupBy).toBe("region");
  });

  it("returns the empty model for a missing result rather than throwing", () => {
    const model = buildGraphModel(null);
    expect(model.topics).toEqual([]);
    expect(model.groupBy).toBeNull();
  });
});

describe("an unknown node or edge type", () => {
  it("is skipped, counted and captured — never drawn and never fatal", () => {
    const base = world15();
    // A future migration's third node type, arriving at a build that predates
    // it. The cast is the point: the declared union is what this build was
    // COMPILED against, not what the live function emits.
    const withUnknown = mapGraphResult(
      [
        ...base.nodes,
        { id: "x", type: "constellation", data: {} } as unknown as MapGraphResult["nodes"][number],
      ],
      [
        ...base.edges,
        { id: "y", source: "a", target: "b", type: "resembles" } as unknown as MapGraphResult["edges"][number],
      ],
    );

    const model = buildGraphModel(withUnknown);

    expect(model.topics).toHaveLength(15);
    expect(model.skippedNodes).toBe(1);
    expect(model.skippedEdges).toBe(1);
    expect(captureErrorMock).toHaveBeenCalledTimes(2);
    expect(captureErrorMock.mock.calls[0][0].message).toContain("constellation");
    expect(captureErrorMock.mock.calls[1][0].message).toContain("resembles");
  });
});

describe("visibleTopicIds", () => {
  it("shows every topic when nothing is focused", () => {
    const model = buildGraphModel(focusWorld());
    expect(visibleTopicIds(model, null).size).toBe(30);
  });

  it("shows the focused topic and every descendant — 14 descendants make 15", () => {
    const model = buildGraphModel(focusWorld());
    const visible = visibleTopicIds(model, "topic-2");
    const idOf = (slug: string) => model.topicBySlug.get(slug)?.id ?? "missing";
    expect(visible.size).toBe(15);
    expect(visible.has(idOf("topic-2"))).toBe(true);
    expect(visible.has(idOf("topic-16"))).toBe(true);
    // A sibling branch of the focus is not in it.
    expect(visible.has(idOf("topic-17"))).toBe(false);
  });

  it("shows the whole map when the focus slug is not in this drawing", () => {
    // A topic retired while the person was looking at it. An empty canvas would
    // read as "this map is empty", which is a lie.
    const model = buildGraphModel(focusWorld());
    expect(visibleTopicIds(model, "topic-that-left").size).toBe(30);
  });

  it("draws only the tree edges with both ends visible", () => {
    const model = buildGraphModel(focusWorld());
    const visible = visibleTopicIds(model, "topic-2");
    const edges = visibleTreeEdges(model, visible);
    // 15 visible topics in one chain from the focus: 14 edges inside it. The
    // edge from the root down INTO the focus has a hidden end and is dropped.
    expect(edges).toHaveLength(14);
    for (const edge of edges) {
      expect(visible.has(edge.source)).toBe(true);
      expect(visible.has(edge.target)).toBe(true);
    }
  });
});
