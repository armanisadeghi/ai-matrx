import {
  materializeDiagramDefaults,
  parseDiagramJSON,
  validateDiagram,
} from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";
import { diagramFromCanvasContent, draftMapFromLines } from "../types";
import { getGridLayout } from "@/components/mardown-display/blocks/diagram/layout-utils";

describe("visual map document", () => {
  it("preserves XYFlow sections and rich arrow options", () => {
    const diagram = parseDiagramJSON(
      JSON.stringify({
        title: "Launch ideas",
        type: "flowchart",
        nodes: [
          {
            id: "section",
            label: "Before launch",
            isGroup: true,
            width: 480,
            height: 300,
            groupStyle: "dotted",
            position: { x: 20, y: 30 },
          },
          {
            id: "interviews",
            label: "Interview users",
            parentId: "section",
            position: { x: 32, y: 72 },
          },
          { id: "launch", label: "Launch", position: { x: 600, y: 140 } },
        ],
        edges: [
          {
            id: "go",
            source: "interviews",
            target: "launch",
            type: "smoothstep",
            lineStyle: "dashed",
            animated: true,
            arrow: false,
          },
        ],
      }),
    );

    expect(diagram.nodes[0]).toMatchObject({
      isGroup: true,
      width: 480,
      height: 300,
      groupStyle: "dotted",
    });
    expect(diagram.nodes[1]).toMatchObject({ parentId: "section" });
    expect(diagram.edges[0]).toMatchObject({
      type: "smoothstep",
      lineStyle: "dashed",
      animated: true,
      arrow: false,
    });
    expect(validateDiagram(diagram)).toBe(true);
  });

  it("rejects duplicate ids and boxes assigned to a non-section", () => {
    const duplicateIds = draftMapFromLines("Duplicate", "One\nTwo");
    duplicateIds.nodes[1].id = duplicateIds.nodes[0].id;
    expect(validateDiagram(duplicateIds)).toBe(false);

    const invalidParent = draftMapFromLines("Parent", "One\nTwo");
    invalidParent.nodes[1].parentId = invalidParent.nodes[0].id;
    expect(validateDiagram(invalidParent)).toBe(false);
  });

  it("materializes automatic visuals while preserving manual overrides", () => {
    const diagram = parseDiagramJSON(
      JSON.stringify({
        title: "Team",
        type: "orgchart",
        nodes: [
          { id: "ceo", label: "Maya — CEO", type: "user" },
          {
            id: "ops",
            label: "Jordan — Operations",
            type: "process",
            color: "#123456",
            icon: "heart",
            shape: "hexagon",
          },
        ],
        edges: [{ from: "ceo", to: "ops" }],
      }),
    );

    expect(diagram.nodes[0]).toMatchObject({
      color: "indigo",
      icon: "Crown",
      shape: "rounded",
      borderStyle: "solid",
      textAlign: "center",
    });
    expect(diagram.nodes[1]).toMatchObject({
      color: "#123456",
      icon: "Heart",
      shape: "hexagon",
    });
    expect(diagram.edges[0]).toMatchObject({
      color: "gray",
      lineStyle: "solid",
      strokeWidth: 2,
      marker: "end",
      animated: false,
    });
    expect(diagram.renderHints).toMatchObject({
      background: "dots",
      showMiniMap: false,
      snapToGrid: false,
      showControls: true,
    });
    expect(materializeDiagramDefaults(diagram)).toEqual(diagram);
  });

  it("opens historical canvas rows whose data is JSON text", () => {
    const diagram = diagramFromCanvasContent(
      {
        type: "diagram",
        data: JSON.stringify({
          diagram: {
            title: "Legacy agent map",
            type: "flowchart",
            nodes: [{ id: "one", label: "One" }],
            edges: [],
          },
        }),
      },
      "Diagram 7",
    );

    expect(diagram).toMatchObject({
      title: "Legacy agent map",
      nodes: [{ id: "one", label: "One", color: "gray", icon: "Square" }],
    });
  });

  it("preserves arbitrary canonical icons while normalizing legacy ids", () => {
    const diagram = parseDiagramJSON(
      JSON.stringify({
        title: "Icons",
        type: "mindmap",
        nodes: [
          { id: "any-lucide", label: "Any Lucide", icon: "AlarmClock" },
          { id: "custom", label: "Custom", icon: "FcGoogle" },
          { id: "legacy", label: "Legacy", icon: "shopping-cart" },
          { id: "empty", label: "No icon", icon: "none" },
        ],
        edges: [],
      }),
    );

    expect(diagram.nodes.map((node) => node.icon)).toEqual([
      "AlarmClock",
      "FcGoogle",
      "ShoppingCart",
      "none",
    ]);
    expect(materializeDiagramDefaults(diagram)).toEqual(diagram);
  });

  it("uses measured box sizes in a grid and preserves section-relative boxes", () => {
    const nodes: Parameters<typeof getGridLayout>[0] = [
      {
        id: "wide-a",
        position: { x: 0, y: 0 },
        data: {},
        measured: { width: 360, height: 80 },
      },
      {
        id: "wide-b",
        position: { x: 0, y: 0 },
        data: {},
        measured: { width: 340, height: 90 },
      },
      {
        id: "inside-section",
        parentId: "wide-a",
        position: { x: 24, y: 64 },
        data: {},
      },
    ];

    const result = getGridLayout(nodes, []);

    expect(result.nodes[1].position.x - result.nodes[0].position.x).toBe(440);
    expect(result.nodes[2].position).toEqual({ x: 24, y: 64 });
  });
});
