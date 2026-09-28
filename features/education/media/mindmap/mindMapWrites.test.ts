import { parseMindMap, trustAfterMindMapEdit, withUniqueEdgeIds } from "./mindMapWrites";

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

describe("withUniqueEdgeIds", () => {
  const nodes = ["a", "b", "c", "d"].map((id) => ({ __kind: "diagram_node", id, label: id.toUpperCase() }));
  const spec = (edges: Record<string, unknown>[]) => ({ __kind: "diagram_spec", title: "Map", type: "mindmap", nodes, edges });

  it("makes a grafted map with restarted and missing edge ids storable (parseMindMap accepts it)", () => {
    // The shape the multi-section generator stored: a root edge with no id,
    // then two sections that both number their edges e1..eN, one repeating e1.
    const raw = spec([
      { source: "a", target: "b" },
      { id: "e1", source: "a", target: "b" },
      { id: "e1", source: "a", target: "c" },
      { id: "e1_2", source: "b", target: "c" },
      { id: "e1", source: "c", target: "d" },
    ]);
    expect(() => parseMindMap(raw)).toThrow();
    const fixed = withUniqueEdgeIds(raw);
    const ids = fixed.edges.map((edge) => (edge as { id: string }).id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["edge_a_b", "e1", "e1_3", "e1_2", "e1_4"]);
    expect(() => parseMindMap(fixed)).not.toThrow();
  });

  it("returns clean edges unchanged", () => {
    const edges = [{ id: "x", source: "a", target: "b" }];
    expect(withUniqueEdgeIds(spec(edges)).edges[0]).toBe(edges[0]);
  });
});
