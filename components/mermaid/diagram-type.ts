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

/**
 * Every diagram type `detectDiagramType` can recognize, in header-table order.
 * Derived from HEADERS so the vocabulary can never drift from the detector —
 * the surface manifest spells this list out for agents (write targets).
 */
export const DETECTABLE_DIAGRAM_TYPES: MermaidDiagramType[] = HEADERS.map(
  ([, type]) => type,
);

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

/**
 * Write-twin of `extractMermaidTitle` — returns `source` with its YAML
 * frontmatter `title:` set to `title`, adding a frontmatter block when the
 * diagram has none. Every other frontmatter key is preserved untouched.
 *
 * Throws when the title cannot round-trip through `extractMermaidTitle`
 * (quotes/newlines) or when the existing frontmatter block is unterminated —
 * a caller with a bad value must hear about it, never get a silent no-op.
 */
export function setMermaidTitle(source: string, title: string): string {
  const clean = title.trim();
  if (!clean) throw new Error("A diagram title cannot be empty.");
  if (/[\n\r]/.test(clean))
    throw new Error("A diagram title must be a single line.");
  if (/["']/.test(clean))
    throw new Error(
      "A diagram title cannot contain quote characters — mermaid frontmatter is YAML and would not read it back.",
    );

  const { lines, bodyStartIndex } = splitFrontmatter(source);
  // Colons and hashes are YAML-significant; quoting keeps them literal, and
  // `splitFrontmatter` strips the wrapping quotes when it reads them back.
  const entry = `title: ${/[:#]/.test(clean) ? `"${clean}"` : clean}`;

  if (lines.length === 0 || lines[0].trim() !== "---")
    return ["---", entry, "---", ...lines].join("\n");
  if (bodyStartIndex >= lines.length)
    throw new Error(
      "This diagram opens a `---` frontmatter block that is never closed — fix the source before setting a title.",
    );

  const otherKeys = lines
    .slice(1, bodyStartIndex - 1)
    .filter((line) => !/^\s*title\s*:/.test(line));
  return ["---", entry, ...otherKeys, "---", ...lines.slice(bodyStartIndex)].join(
    "\n",
  );
}
