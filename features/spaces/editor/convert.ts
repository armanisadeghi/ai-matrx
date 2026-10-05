// features/spaces/editor/convert.ts — the store boundary: BlockNote blocks <-> SpaceBlock.
//
// The editor engine (BlockNote) never leaks into stored documents. Stored type names are ours and
// never renamed once stored; the engine's names are mapped here. Nothing is dropped or flattened:
//  - stored-only blocks (media, bookmark, embed, equation, toc, breadcrumb, database) ride as their own
//    engine block with the stored props kept verbatim in one `data` prop;
//  - a `text` block carrying `props.unsupported` (an importer's marker) is its own engine block;
//  - simple tables map to BlockNote's table (cells are RichSpan[] both ways);
//  - mention and inline-equation spans are engine inline nodes holding the whole span;
//  - a type this editor has never heard of rides as `unknownBlock` holding the whole stored block.

import type { RichSpan, SpaceBlock, SpaceColor } from "../contract";

/** Stored type <-> engine type. Custom blocks (callout, page, columns…) use the same name on both sides. */
const TO_ENGINE: Record<string, string> = {
  text: "paragraph",
  heading: "heading",
  bulleted: "bulletListItem",
  numbered: "numberedListItem",
  todo: "checkListItem",
  toggle: "toggleListItem",
  quote: "quote",
  divider: "divider",
  code: "codeBlock",
};
const FROM_ENGINE: Record<string, string> = Object.fromEntries(Object.entries(TO_ENGINE).map(([k, v]) => [v, k]));

/** Stored types drawn by a block of the same name whose stored props ride verbatim in `props.data`. */
export const DATA_BLOCKS = new Set(["equation", "image", "video", "audio", "file", "pdf", "bookmark", "embed", "tableOfContents", "breadcrumb", "database"]);

/** Every engine block type the Spaces schema knows (editor/schema.tsx). Anything else is `unknownBlock`. */
const ENGINE_TYPES = new Set([
  ...Object.values(TO_ENGINE),
  "callout",
  "page",
  "linkToPage",
  "columnList",
  "column",
  "slot",
  "table",
  "unsupportedText",
  "unknownBlock",
  ...DATA_BLOCKS,
]);

/** Engine blocks whose content is "none" — they carry no inline text. */
const NO_CONTENT = new Set(["divider", "page", "linkToPage", "columnList", "column", "slot", "table", "unknownBlock", ...DATA_BLOCKS]);

const parse = (raw: unknown): Record<string, unknown> => {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

type Styles = Record<string, boolean | string | undefined>;
interface EngineText {
  type: "text";
  text: string;
  styles: Styles;
}
interface EngineLink {
  type: "link";
  href: string;
  content: EngineText[];
}
type EngineInline = EngineText | EngineLink | { type: string; [k: string]: unknown };

export interface EngineBlock {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: EngineInline[] | unknown;
  children?: EngineBlock[];
}

const isColor = (v: unknown): v is SpaceColor => typeof v === "string" && v !== "" && v !== "default";

function spanToEngineStyles(s: RichSpan): Styles {
  const styles: Styles = {};
  if (s.bold) styles.bold = true;
  if (s.italic) styles.italic = true;
  if (s.underline) styles.underline = true;
  if (s.strike) styles.strike = true;
  if (s.code) styles.code = true;
  if (isColor(s.color)) styles.textColor = s.color;
  if (isColor(s.background)) styles.backgroundColor = s.background;
  return styles;
}

function spansToEngine(spans: RichSpan[] | undefined): EngineInline[] {
  const out: EngineInline[] = [];
  for (const s of spans ?? []) {
    if (s.mention || s.equation !== undefined) {
      // The whole span (marks, link and all) rides on the node, so nothing about it is lost.
      out.push({ type: s.mention ? "inlineMention" : "inlineEquation", props: { span: JSON.stringify(s) } });
      continue;
    }
    const text: EngineText = { type: "text", text: s.text, styles: spanToEngineStyles(s) };
    if (s.link) {
      const last = out.at(-1);
      if (last && last.type === "link" && (last as EngineLink).href === s.link) (last as EngineLink).content.push(text);
      else out.push({ type: "link", href: s.link, content: [text] });
    } else {
      out.push(text);
    }
  }
  return out;
}

function engineTextToSpan(t: EngineText, link?: string): RichSpan {
  const s: RichSpan = { text: t.text };
  const st = t.styles ?? {};
  if (st.bold) s.bold = true;
  if (st.italic) s.italic = true;
  if (st.underline) s.underline = true;
  if (st.strike) s.strike = true;
  if (st.code) s.code = true;
  if (isColor(st.textColor)) s.color = st.textColor;
  if (isColor(st.backgroundColor)) s.background = st.backgroundColor;
  if (link) s.link = link;
  return s;
}

function engineToSpans(content: unknown): RichSpan[] {
  if (!Array.isArray(content)) return [];
  const out: RichSpan[] = [];
  for (const node of content as EngineInline[]) {
    if (node.type === "text") out.push(engineTextToSpan(node as EngineText));
    else if (node.type === "inlineMention" || node.type === "inlineEquation") {
      const span = parse((node as { props?: Record<string, unknown> }).props?.span) as unknown as RichSpan;
      if (typeof span.text === "string") out.push(span);
    } else if (node.type === "link") for (const t of (node as EngineLink).content) out.push(engineTextToSpan(t, (node as EngineLink).href));
  }
  return out;
}

interface TableCellOut {
  type: "tableCell";
  props?: Record<string, unknown>;
  content?: unknown;
}

function tableToEngine(block: SpaceBlock): EngineBlock {
  const p = block.props ?? {};
  const rows = (Array.isArray(p.rows) ? p.rows : []) as Array<{ cells?: RichSpan[][] }>;
  const width = Math.max(1, ...rows.map((r) => r.cells?.length ?? 0));
  const widths = Array.isArray(p.columnWidths) ? (p.columnWidths as Array<number | null>) : [];
  const props: Record<string, unknown> = {};
  if (isColor(block.color)) props.textColor = block.color;
  return {
    id: block.id,
    type: "table",
    props,
    content: {
      type: "tableContent",
      columnWidths: Array.from({ length: width }, (_, i) => (typeof widths[i] === "number" ? widths[i] : undefined)),
      headerRows: p.headerRow ? 1 : undefined,
      headerCols: p.headerColumn ? 1 : undefined,
      rows: rows.map((r) => ({ cells: Array.from({ length: width }, (_, i) => spansToEngine(r.cells?.[i] ?? [])) })),
    },
    children: [],
  };
}

function tableFromEngine(block: EngineBlock): SpaceBlock {
  const c = (block.content ?? {}) as { columnWidths?: Array<number | undefined | null>; headerRows?: number; headerCols?: number; rows?: Array<{ cells?: unknown[] }> };
  const rows = (c.rows ?? []).map((r) => ({
    cells: (r.cells ?? []).map((cell) => engineToSpans(Array.isArray(cell) ? cell : (cell as TableCellOut)?.content)),
  }));
  const props: Record<string, unknown> = { headerRow: Boolean(c.headerRows), headerColumn: Boolean(c.headerCols), rows };
  if ((c.columnWidths ?? []).some((w) => typeof w === "number")) props.columnWidths = (c.columnWidths ?? []).map((w) => (typeof w === "number" ? w : null));
  const out: SpaceBlock = { id: block.id, type: "table", props };
  const color = block.props?.textColor;
  if (isColor(color)) out.color = color;
  return out;
}

export function toEngine(blocks: SpaceBlock[]): EngineBlock[] {
  return blocks.map((block) => {
    if (block.type === "table") return tableToEngine(block);
    if (DATA_BLOCKS.has(block.type)) {
      const data = JSON.stringify({ props: block.props ?? {}, color: block.color, background: block.background });
      return { id: block.id, type: block.type, props: { data }, children: [] };
    }
    const known = ENGINE_TYPES.has(TO_ENGINE[block.type] ?? block.type) && block.type !== "unknownBlock" && block.type !== "unsupportedText";
    if (!known) return { id: block.id, type: "unknownBlock", props: { data: JSON.stringify(block) }, children: [] };
    if (block.type === "text" && block.props?.unsupported) {
      const { textAlignment: _a, ...rest } = block.props;
      const props: Record<string, unknown> = { data: JSON.stringify(rest) };
      if (isColor(block.color)) props.textColor = block.color;
      if (isColor(block.background)) props.backgroundColor = block.background;
      return { id: block.id, type: "unsupportedText", props, content: spansToEngine(block.text), children: toEngine(block.children ?? []) };
    }
    const type = TO_ENGINE[block.type] ?? block.type;
    const props: Record<string, unknown> = { ...(block.props ?? {}) };
    if (block.type === "heading" && props.toggleable) {
      props.isToggleable = true;
    }
    delete props.toggleable;
    if (isColor(block.color)) props.textColor = block.color;
    if (isColor(block.background)) props.backgroundColor = block.background;
    const out: EngineBlock = { id: block.id, type, props, children: toEngine(block.children ?? []) };
    if (!NO_CONTENT.has(type)) out.content = spansToEngine(block.text);
    return out;
  });
}

export function fromEngine(blocks: EngineBlock[]): SpaceBlock[] {
  return blocks.map((block) => {
    if (block.type === "table") return tableFromEngine(block);
    if (block.type === "unknownBlock") return parse(block.props?.data) as unknown as SpaceBlock;
    if (DATA_BLOCKS.has(block.type)) {
      const d = parse(block.props?.data) as { props?: Record<string, unknown>; color?: SpaceColor; background?: SpaceColor };
      const out: SpaceBlock = { id: block.id, type: block.type };
      if (isColor(d.color)) out.color = d.color;
      if (isColor(d.background)) out.background = d.background;
      if (d.props && Object.keys(d.props).length) out.props = d.props;
      return out;
    }
    if (block.type === "unsupportedText") {
      const out: SpaceBlock = { id: block.id, type: "text", text: engineToSpans(block.content), props: parse(block.props?.data) };
      if (isColor(block.props?.textColor)) out.color = block.props.textColor;
      if (isColor(block.props?.backgroundColor)) out.background = block.props.backgroundColor;
      if (block.children?.length) out.children = fromEngine(block.children);
      return out;
    }
    const type = FROM_ENGINE[block.type] ?? block.type;
    const { textColor, backgroundColor, isToggleable, textAlignment, ...rest } = block.props ?? {};
    const props: Record<string, unknown> = { ...rest };
    if (isToggleable) props.toggleable = true;
    if (textAlignment && textAlignment !== "left") props.textAlignment = textAlignment;
    const out: SpaceBlock = { id: block.id, type };
    const text = engineToSpans(block.content);
    if (!NO_CONTENT.has(block.type)) out.text = text;
    if (isColor(textColor)) out.color = textColor;
    if (isColor(backgroundColor)) out.background = backgroundColor;
    if (Object.keys(props).length) out.props = props;
    if (block.children?.length) out.children = fromEngine(block.children);
    return out;
  });
}

/** Plain text of a block tree — for search and the quick-find preview. */
export function plainText(blocks: SpaceBlock[]): string {
  const parts: string[] = [];
  const walk = (list: SpaceBlock[]) => {
    for (const b of list) {
      if (b.text?.length) parts.push(b.text.map((s) => s.text).join(""));
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  return parts.join("\n");
}
