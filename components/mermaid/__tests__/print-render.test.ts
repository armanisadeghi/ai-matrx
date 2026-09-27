/**
 * The studio's Print / Save PDF printed every diagram as its source (verifier
 * round 2). Print now draws each ```mermaid fence and hands the package the
 * SVG by the SAME source string the package passes to `renderFence`.
 */
jest.mock("../runtime", () => ({
  renderMermaid: async (source: string) => {
    if (source.includes("broken")) throw new Error("parse error");
    return { svg: `<svg data-src="${source.length}"></svg>` };
  },
}));
import { drawMermaidForPrint, mermaidFenceSources } from "../print-render";

const MD = [
  "# Runbook",
  "",
  "```mermaid",
  "flowchart LR",
  "  A --> B",
  "```",
  "",
  "```ts",
  "const x = 1;",
  "```",
  "",
  "~~~~mermaid",
  "sequenceDiagram",
  "  U->>G: hi",
  "~~~~",
  "",
  "```mermaid",
  "broken",
  "```",
].join("\n");

it("finds each mermaid fence body, dedented, in order", () => {
  expect(mermaidFenceSources(MD)).toEqual(["flowchart LR\n  A --> B", "sequenceDiagram\n  U->>G: hi", "broken"]);
});

it("draws them all and counts the ones it could not", async () => {
  const { pictures, failed } = await drawMermaidForPrint(MD);
  expect(pictures.size).toBe(2);
  expect(failed).toBe(1);
});
