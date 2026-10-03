import { canvasPresentation, preferredFlowDirection } from "@ai-matrx/canvas";
import {
  diagramDirectionForFlow,
  shouldRelayoutOnFlowChange,
} from "../presentation-direction";

const flowOf = (width: number, height: number) =>
  preferredFlowDirection(
    canvasPresentation({ width, height, isFullscreen: false, paneCount: 1 }),
  );

describe("a diagram's direction follows the canvas pane", () => {
  it("a tall narrow pane lays a knowledge graph out top to bottom, even when the data asked for left to right", () => {
    expect(diagramDirectionForFlow(flowOf(420, 900), "LR", "network")).toBe(
      "TB",
    );
    expect(diagramDirectionForFlow(flowOf(420, 900), undefined, "mindmap")).toBe(
      "TB",
    );
  });

  it("a wide (expanded) pane lays the same graph out left to right", () => {
    expect(diagramDirectionForFlow(flowOf(1600, 800), "TB", "flowchart")).toBe(
      "LR",
    );
  });

  it("keeps a reversed hint's sense on the new axis", () => {
    expect(diagramDirectionForFlow("vertical", "RL", "network")).toBe("BT");
    expect(diagramDirectionForFlow("horizontal", "BT", "network")).toBe("RL");
  });

  it("outside the canvas the data's direction is unchanged", () => {
    expect(diagramDirectionForFlow(null, "LR", "network")).toBe("LR");
    expect(diagramDirectionForFlow(null, undefined, "flowchart")).toBe("TB");
  });

  it("never re-chooses the direction of a family tree or org chart", () => {
    expect(diagramDirectionForFlow("horizontal", "TB", "pedigree")).toBe("TB");
    expect(diagramDirectionForFlow("horizontal", "TB", "orgchart")).toBe("TB");
  });
});

describe("a pane flip re-lays out only an arrangement that is still ours", () => {
  const flip = {
    previousFlow: "vertical" as const,
    flow: "horizontal" as const,
    autoLaidOut: true,
    personArranged: false,
    authoring: false,
  };

  it("re-lays out when the pane flips and nobody touched it", () => {
    expect(shouldRelayoutOnFlowChange(flip)).toBe(true);
  });

  it("a person's manual arrangement or chosen direction wins", () => {
    expect(shouldRelayoutOnFlowChange({ ...flip, personArranged: true })).toBe(
      false,
    );
  });

  it("an authored map's layout is the document", () => {
    expect(shouldRelayoutOnFlowChange({ ...flip, authoring: true })).toBe(
      false,
    );
  });

  it("does nothing when the flow did not change or there is no canvas", () => {
    expect(
      shouldRelayoutOnFlowChange({ ...flip, flow: "vertical" }),
    ).toBe(false);
    expect(shouldRelayoutOnFlowChange({ ...flip, flow: null })).toBe(false);
  });
});
