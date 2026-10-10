import { buildCanvasGraph } from "../tableMapGraph";
import { buildTableMap } from "../tableMapModel";

const map = buildTableMap(
  [
    { tableId: "a", name: "Patients", href: "/data/a", organizationId: "o", organizationName: "Harbor" },
    { tableId: "b", name: "Visits", href: "/data/b", organizationId: "o", organizationName: "Harbor" },
  ],
  [{ table_id: "a", field_key: "v", field_label: "Visits", field_type: "relation", relation_target: "b", inverse_key: "p", field_sort: 1, is_link: true }],
);

describe("the map's graph", () => {
  const graph = buildCanvasGraph(map, () => 3, () => undefined);
  const cards = graph.nodes.filter((n) => n.type === "tableCard");

  it("makes every card take the pointer — a node that is neither selectable nor draggable is pointer-events:none and a real click falls to the pane", () => {
    expect(cards).toHaveLength(2);
    for (const n of cards) {
      expect(n.draggable).toBe(false);
      expect(n.selectable).toBe(true);
      expect((n.style as { pointerEvents?: string }).pointerEvents).toBe("all");
    }
  });

  it("draws the link as one line with an arrow at both ends when it is two-way", () => {
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ source: "a", target: "b" });
    expect(graph.edges[0]!.markerStart).toBeDefined();
  });
});
