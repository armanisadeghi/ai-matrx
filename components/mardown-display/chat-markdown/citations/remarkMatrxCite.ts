/**
 * Remark plugin: recognizes inline citation markers `<matrxcite n="3" />`
 * inside markdown TEXT nodes and emits inline `matrx-cite` custom elements so
 * `react-markdown` renders them via the `components` map
 * (→ `CitationMarkerInline`).
 *
 * Why text nodes (mirroring `remarkMatrxVariable`), not raw HTML / the block
 * splitter: `preprocessContent` in BasicMarkdownContent escapes every
 * non-allow-listed tag to `&lt;matrxcite …&gt;`, and CommonMark decodes the
 * entities back to literal `<matrxcite n="3" />` inside text nodes — so the
 * marker arrives here as plain text, safely inside the paragraph flow. The
 * splitter path (audiocite-style) would make each marker its OWN vertically
 * stacked block and re-break citation-split sentences mid-line — the exact
 * regression fixed on 2026-07-16.
 *
 * Design rules (same as remarkMatrxVariable):
 *  - Runs at render time on the mdast AST — source strings are never mutated.
 *  - Only transforms `text` nodes; code spans/fences keep the literal text.
 *  - The source number lives on the DOM as `data-n`.
 *
 * Markers are inserted into display text by
 * `features/agents/redux/execution-system/messages/message-citations.ts`
 * (`insertCitationMarkers`) — this plugin is the render-side half.
 */

const CITE_PATTERN = /<matrxcite\s+n="(\d+)"\s*\/>/g;

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

function expandTextNode(value: string): MdastNode[] {
  CITE_PATTERN.lastIndex = 0;
  const parts: MdastNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let matched = false;

  while ((match = CITE_PATTERN.exec(value)) !== null) {
    matched = true;
    const start = match.index;
    const end = start + match[0].length;
    const n = match[1];

    if (start > lastIdx) {
      parts.push({ type: "text", value: value.slice(lastIdx, start) });
    }

    parts.push({
      type: "matrxCite",
      data: {
        hName: "matrx-cite",
        hProperties: { "data-n": n },
      },
    });

    lastIdx = end;
  }

  if (!matched) {
    return [{ type: "text", value }];
  }

  if (lastIdx < value.length) {
    parts.push({ type: "text", value: value.slice(lastIdx) });
  }

  return parts;
}

const SKIP_TYPES = new Set([
  "code",
  "inlineCode",
  "html",
  "yaml",
  "toml",
  "math",
  "inlineMath",
]);

function walk(node: MdastNode): void {
  if (!node || SKIP_TYPES.has(node.type)) return;
  const children = node.children;
  if (!Array.isArray(children) || children.length === 0) return;

  const next: MdastNode[] = [];
  let mutated = false;

  for (const child of children) {
    if (
      child?.type === "text" &&
      typeof child.value === "string" &&
      child.value.includes("<matrxcite")
    ) {
      const expanded = expandTextNode(child.value);
      if (expanded.length !== 1 || expanded[0].type !== "text") {
        mutated = true;
      }
      next.push(...expanded);
    } else {
      next.push(child);
      walk(child);
    }
  }

  if (mutated) {
    node.children = next;
  }
}

export default function remarkMatrxCite() {
  return (tree: MdastNode) => {
    walk(tree);
  };
}
