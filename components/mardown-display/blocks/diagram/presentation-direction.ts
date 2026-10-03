/**
 * Which way a diagram flows when the canvas tells us the shape of its pane.
 *
 * Outside the canvas there is no presentation (`flow === null`) and the
 * diagram keeps the direction its data asks for — behaviour unchanged.
 *
 * Inside the canvas the AXIS follows the pane: a tall narrow pane flows top to
 * bottom, a wide one left to right (`preferredFlowDirection` from
 * `@ai-matrx/canvas`). The data's hint only keeps its SENSE — a "BT" diagram
 * stays bottom-up in a portrait pane and becomes right-to-left in a wide one.
 * A family tree (pedigree) and an org chart are generational/hierarchical by
 * meaning, so their direction is never re-chosen.
 */
export type DiagramDirection = "TB" | "LR" | "BT" | "RL";
export type CanvasFlow = "vertical" | "horizontal";

const DIRECTION_IS_MEANING = new Set(["pedigree", "orgchart"]);

export function diagramDirectionForFlow(
  flow: CanvasFlow | null,
  hinted: DiagramDirection | undefined,
  diagramType: string,
): DiagramDirection {
  const authored = hinted ?? "TB";
  if (flow === null || DIRECTION_IS_MEANING.has(diagramType)) return authored;
  const reversed = authored === "BT" || authored === "RL";
  if (flow === "vertical") return reversed ? "BT" : "TB";
  return reversed ? "RL" : "LR";
}

/**
 * When the pane's flow flips (split, unsplit, expand), re-lay the diagram out
 * only when the current arrangement is still OURS: the automatic layout has
 * run, nobody re-arranged it by hand, and the diagram is not an authored map
 * whose layout is the document.
 */
export function shouldRelayoutOnFlowChange(input: {
  previousFlow: CanvasFlow | null;
  flow: CanvasFlow | null;
  autoLaidOut: boolean;
  personArranged: boolean;
  authoring: boolean;
}): boolean {
  const { previousFlow, flow, autoLaidOut, personArranged, authoring } = input;
  if (flow === null || previousFlow === null || flow === previousFlow) {
    return false;
  }
  return autoLaidOut && !personArranged && !authoring;
}
