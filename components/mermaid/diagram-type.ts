/**
 * Diagram-type detection from raw mermaid source.
 *
 * TS twin of the Python `_HEADERS` table in aidream
 * packages/matrx-ai/matrx_ai/processing/blocks/parsers/mermaid_parser.py —
 * keep the two in lockstep. Used before the mermaid engine loads (streaming
 * labels) and for catalog lookups, so it must stay dependency-free.
 */

export type MermaidDiagramType =
  | "flowchart"
  | "sequence"
  | "class"
  | "state"
  | "er"
  | "journey"
  | "gantt"
  | "pie"
  | "mindmap"
  | "timeline"
  | "quadrant"
  | "git"
  | "c4"
  | "sankey"
  | "xychart"
  | "block"
  | "packet"
  | "kanban"
  | "architecture"
  | "radar"
  | "requirement"
  | "zenuml"
  | "unknown";

const HEADERS: Array<[RegExp, MermaidDiagramType]> = [
  [/^(flowchart|graph)\b/, "flowchart"],
  [/^sequenceDiagram\b/, "sequence"],
  [/^classDiagram/, "class"],
  [/^stateDiagram/, "state"],
  [/^erDiagram/, "er"],
  [/^journey\b/, "journey"],
  [/^gantt\b/, "gantt"],
  [/^pie\b/, "pie"],
  [/^mindmap\b/, "mindmap"],
  [/^timeline\b/, "timeline"],
  [/^quadrantChart\b/, "quadrant"],
  [/^gitGraph\b/, "git"],
  [/^C4(Context|Container|Component|Dynamic|Deployment)\b/, "c4"],
  [/^sankey(-beta)?\b/, "sankey"],
  [/^xychart(-beta)?\b/, "xychart"],
  [/^block(-beta)?\b/, "block"],
  [/^packet(-beta)?\b/, "packet"],
  [/^kanban\b/, "kanban"],
  [/^architecture(-beta)?\b/, "architecture"],
  [/^radar(-beta)?\b/, "radar"],
  [/^requirementDiagram\b/, "requirement"],
  [/^zenuml\b/, "zenuml"],
];

/**
 * Returns the body lines with YAML frontmatter stripped, plus the extracted
 * frontmatter title (if any). Tolerates an unterminated frontmatter block
 * (mid-stream) by treating everything after `---` as frontmatter-in-progress.
 */
export function splitFrontmatter(source: string): {
  title: string | null;
  bodyStartIndex: number;
  lines: string[];
} {
  const lines = source.split("\n");
  let title: string | null = null;
  let bodyStartIndex = 0;
  if (lines.length > 0 && lines[0].trim() === "---") {
    bodyStartIndex = lines.length; // until proven terminated
    for (let j = 1; j < Math.min(lines.length, 30); j++) {
      const s = lines[j].trim();
      if (s === "---") {
        bodyStartIndex = j + 1;
        break;
      }
      const m = /^title:\s*(.+)$/.exec(s);
      if (m) title = m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return { title, bodyStartIndex, lines };
}

/** Detect the diagram type from the first significant line of the source. */
export function detectDiagramType(source: string): MermaidDiagramType {
  const { bodyStartIndex, lines } = splitFrontmatter(source);
  for (let i = bodyStartIndex; i < lines.length; i++) {
    const s = lines[i].trim();
    if (!s || s.startsWith("%%")) continue;
    for (const [pattern, type] of HEADERS) {
      if (pattern.test(s)) return type;
    }
    return "unknown";
  }
  return "unknown";
}

/** Extract the frontmatter title from mermaid source, if present. */
export function extractMermaidTitle(source: string): string | null {
  return splitFrontmatter(source).title;
}
