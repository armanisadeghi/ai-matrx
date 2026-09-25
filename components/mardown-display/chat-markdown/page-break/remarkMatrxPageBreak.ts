/**
 * Remark plugin: renders a markdown page-break directive as a visible
 * "Page break" divider — the on-screen half of the print system's page break.
 *
 * The grammar is NOT defined here. It is `isPageBreakLine` from
 * `@ai-matrx/print/directives` — the same function the print converters use,
 * so what previews as a page break is exactly what prints as one:
 *
 *   <!-- pagebreak -->   (canonical)   \pagebreak   \newpage
 *   <!-- newpage -->   <div style="page-break-after: always"></div>
 *
 * A directive can reach the AST in two shapes, and both are handled:
 *  - an `html` node — a comment or `<div>` on its own line, parsed as raw HTML;
 *  - a `paragraph` whose only content is the directive as TEXT — `\newpage`,
 *    or a `<div …>` that the chat's preprocessing escaped to entities.
 *
 * Code spans and fences are never touched: they are `code` / `inlineCode`
 * nodes, not `html` or `paragraph`.
 *
 * The divider carries the `matrx-page-break` class (the print package's class)
 * so a browser print of the page breaks there too — see the print rule in
 * `styles/globals.css`.
 */

import {
  PAGE_BREAK_CLASS,
  PAGE_BREAK_LABEL,
  isPageBreakLine,
} from "@ai-matrx/print/directives";

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: Record<string, unknown>;
  [key: string]: unknown;
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

function isDirectiveNode(node: MdastNode): boolean {
  if (node.type === "html") return isPageBreakLine(node.value ?? "");
  if (node.type !== "paragraph" || !node.children?.length) return false;
  if (!node.children.every((c) => c.type === "text")) return false;
  return isPageBreakLine(node.children.map((c) => c.value ?? "").join(""));
}

function transform(parent: MdastNode): void {
  const children = parent.children;
  if (!children) return;
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as MdastNode;
    if (isDirectiveNode(child)) {
      children[i] = pageBreakNode();
      continue;
    }
    if (child.type !== "code" && child.type !== "inlineCode") transform(child);
  }
}

export default function remarkMatrxPageBreak() {
  return (tree: MdastNode) => {
    transform(tree);
  };
}
