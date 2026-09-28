import { parseMindMap, trustAfterMindMapEdit } from "./mindMapWrites";

describe("mind-map writes", () => {
  const envelope = {
    __kind: "diagram_spec",
    title: "Original",
    type: "mindmap",
    nodes: [{ __kind: "diagram_node", id: "root", label: "Root", metadata: { cardId: "card-1" } }],
    edges: [],
    layout: { direction: "TB" },
  };
  it("keeps declared node metadata when validating a stored envelope", () => {
    const parsed = parseMindMap(envelope);
    expect(parsed.nodes[0]).toMatchObject({ __kind: "diagram_node", id: "root", label: "Root", metadata: { cardId: "card-1" } });
    expect(parsed.layout).toEqual({ direction: "TB" });
  });

  it("rejects edges whose endpoints are absent", () => {
    expect(() => parseMindMap({ ...envelope, edges: [{ id: "bad", source: "root", target: "missing" }] })).toThrow("must connect two nodes");
  });

  it("downgrades edited generated evidence without discarding citations", () => {
    expect(trustAfterMindMapEdit({ confidence: "grounded", citations: [{ sourceId: "source", sourceKind: "document" }] })).toMatchObject({ confidence: "inferred", citations: [{ sourceId: "source" }] });
  });
});
