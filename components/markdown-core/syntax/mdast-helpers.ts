// Small, dependency-free helpers the syntax plugins share. The mdast shape is
// declared loosely on purpose: directive, definition-list, front-matter and
// math nodes come from several extensions whose types do not compose, and a
// plugin here only ever reads the fields named below.

export interface MData {
  hName?: string;
  hProperties?: Record<string, unknown>;
  hChildren?: unknown[];
  directiveLabel?: boolean;
  [key: string]: unknown;
}

export interface MNode {
  type: string;
  value?: string;
  children?: MNode[];
  data?: MData;
  position?: { start: { offset?: number }; end: { offset?: number } };
  name?: string;
  attributes?: Record<string, string | null | undefined> | null;
  lang?: string | null;
  meta?: string | null;
  depth?: number;
  identifier?: string;
  label?: string | null;
  checked?: boolean | null;
  url?: string;
  [key: string]: unknown;
}

export interface SyntaxFile {
  value?: unknown;
  data?: Record<string, unknown>;
}

/** An mdast node that becomes the hast element `tag` with `props`. */
export function el(
  tag: string,
  props: Record<string, unknown>,
  children: MNode[] = [],
  type = "matrxElement",
): MNode {
  return { type, data: { hName: tag, hProperties: props }, children };
}

export function text(value: string): MNode {
  return { type: "text", value };
}

/** Plain text of a node (mdast-util-to-string semantics, minus images' alt). */
export function toText(node: MNode | undefined): string {
  if (!node) return "";
  if (typeof node.value === "string") return node.value;
  if (!node.children) return "";
  return node.children.map(toText).join("");
}

/** The node's own source text, when the parser recorded where it came from. */
export function rawOf(node: MNode, file: SyntaxFile | undefined): string | null {
  const source = typeof file?.value === "string" ? file.value : null;
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (source === null || start === undefined || end === undefined) return null;
  return source.slice(start, end);
}

/** Merge adjacent text nodes (after a pass restored literal text). */
export function mergeText(children: MNode[]): MNode[] {
  const out: MNode[] = [];
  for (const child of children) {
    const prev = out[out.length - 1];
    if (child.type === "text" && prev && prev.type === "text" && !prev.data && !child.data) {
      out[out.length - 1] = { type: "text", value: (prev.value ?? "") + (child.value ?? "") };
    } else {
      out.push(child);
    }
  }
  return out;
}

/** Depth-first, pre-order walk over every parent's children array. */
export function walkParents(node: MNode, visit: (parent: MNode) => void): void {
  if (!node.children) return;
  visit(node);
  for (const child of node.children) walkParents(child, visit);
}

/** Id-safe slug for a label the author wrote (`fig:growth` stays `fig:growth`). */
export function safeId(label: string): string {
  return label.trim().replace(/\s+/g, "-").replace(/[^\w:.\-]/g, "");
}
