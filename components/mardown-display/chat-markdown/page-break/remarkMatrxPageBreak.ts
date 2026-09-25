/**
 * Remark plugin: renders a markdown page-break directive as a visible
 * "Page break" divider — the on-screen half of the print system's page break.
 *
 * The grammar is NOT defined here. It is `isBreakLine` (page OR section break) from
 * `@ai-matrx/print/directives` — the same function the print converters use,
 * so what previews as a page break is exactly what prints as one:
 *
 *   <!-- pagebreak -->   (canonical)   \pagebreak   \newpage
 *   <!-- newpage -->   <div style="page-break-after: always"></div>
 *
 * Screen and paper must agree line for line, so the rules mirror the printer:
 *  - Only TOP-LEVEL lines are directives (the printer reads lines; a `> \newpage`
 *    or `- \newpage` is a quote/list item there, so it is one here too).
 *  - A directive is judged on its RAW source line (so an escaped `\\newpage`
 *    stays text, as it does on paper), for both shapes it can take in the AST:
 *    an `html` node (comment / `<div>` on its own line) or a `paragraph`
 *    (`\newpage`, or a `<div …>` the chat preprocessing escaped to entities).
 *  - `isolatePageBreakLines` runs on the SOURCE before parsing, so a directive
 *    written directly under a line of text becomes its own block instead of
 *    melting into that paragraph (the printer breaks there; so must we).
 *
 * Code spans and fences are never touched: they are `code` / `inlineCode`
 * nodes, and the isolation pass skips fenced regions.
 *
 * The divider carries the `matrx-page-break` class (the print package's class)
 * so a browser print of the page breaks there too — see the print rule at the
 * end of `app/globals.css`.
 */

import {
  PAGE_BREAK_CLASS,
  PAGE_BREAK_LABEL,
  // A section break (`<!-- section landscape -->`) starts a new page too, so
  // the screen divides exactly where paper does.
  isBreakLine,
} from "@ai-matrx/print/directives";
import { fenceLineKinds } from "@ai-matrx/content-ir/source";

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: Record<string, unknown>;
  position?: { start: { offset?: number }; end: { offset?: number } };
  [key: string]: unknown;
}

interface SourceFile {
  value?: unknown;
}

/**
 * Give every directive line its own block: blank lines around it, outside
 * fenced code. Pure and idempotent; returns the input untouched when there is
 * no directive (the common case costs one scan).
 */
export function isolatePageBreakLines(source: string): string {
  if (!source) return source;
  const lines = source.split("\n");
  // Fenced code keeps its directives literal — THE one code-range rule.
  const kinds = fenceLineKinds(source);
  let changed = false;
  const out: string[] = [];
  for (const [i, line] of lines.entries()) {
    if (kinds[i] === "prose" && isBreakLine(line)) {
      if (out.length > 0 && (out[out.length - 1] ?? "").trim() !== "") out.push("");
      out.push(line, "");
      changed = true;
      continue;
    }
    out.push(line);
  }
  return changed ? out.join("\n") : source;
}

const RULE_CLASS = [
  "h-0",
  "flex-1",
  "border-t-2",
  "border-dashed",
  "border-muted-foreground/40",
];

/** The mdast node that renders as the divider (a childless paragraph → div). */
function pageBreakNode(): MdastNode {
  const rule = {
    type: "element",
    tagName: "span",
    properties: { className: RULE_CLASS, ariaHidden: "true" },
    children: [],
  };
  return {
    type: "paragraph",
    children: [],
    data: {
      hName: "div",
      hProperties: {
        className: [
          PAGE_BREAK_CLASS,
          "not-prose",
          "my-8",
          "flex",
          "items-center",
          "gap-3",
          "select-none",
        ],
        role: "separator",
        ariaLabel: PAGE_BREAK_LABEL,
        dataMatrxPageBreak: "",
      },
      hChildren: [
        rule,
        {
          type: "element",
          tagName: "span",
          properties: {
            className: [
              "text-[10px]",
              "font-semibold",
              "uppercase",
              "tracking-[0.08em]",
              "text-muted-foreground",
            ],
          },
          children: [{ type: "text", value: PAGE_BREAK_LABEL }],
        },
        { ...rule },
      ],
    },
  };
}

/** The node's own source text, when the parser recorded where it came from. */
function rawSource(node: MdastNode, file: SourceFile | undefined): string | null {
  const source = typeof file?.value === "string" ? file.value : null;
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (source === null || start === undefined || end === undefined) return null;
  return source.slice(start, end);
}

function decodeTagEntities(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

function isDirectiveNode(node: MdastNode, file: SourceFile | undefined): boolean {
  if (node.type !== "html" && node.type !== "paragraph") return false;
  const raw = rawSource(node, file);
  // The chat's prose preparation escapes non-allow-listed tags to entities
  // (`<div …>` → `&lt;div …&gt;`); undo exactly that before judging the line.
  if (raw !== null) return isBreakLine(decodeTagEntities(raw));
  // No positions (a caller built the tree by hand): judge the parsed text.
  if (node.type === "html") return isBreakLine(node.value ?? "");
  if (!node.children?.length || !node.children.every((c) => c.type === "text")) return false;
  return isBreakLine(node.children.map((c) => c.value ?? "").join(""));
}

export default function remarkMatrxPageBreak() {
  return (tree: MdastNode, file?: SourceFile) => {
    // Top level only — see the header.
    const children = tree.children;
    if (!children) return;
    for (let i = 0; i < children.length; i++) {
      if (isDirectiveNode(children[i] as MdastNode, file)) children[i] = pageBreakNode();
    }
  };
}
