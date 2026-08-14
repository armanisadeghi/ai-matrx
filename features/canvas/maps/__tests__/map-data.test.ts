import {
  parseDiagramJSON,
  validateDiagram,
} from "@/components/mardown-display/blocks/diagram/parseDiagramJSON";
import { draftMapFromLines } from "../types";

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
});
