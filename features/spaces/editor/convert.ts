// features/spaces/editor/convert.ts — the store boundary: BlockNote blocks <-> SpaceBlock.
//
// The editor engine (BlockNote) never leaks into stored documents. Stored type names are ours and
// never renamed once stored; the engine's names are mapped here. Unknown blocks pass through as-is.

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

/** Engine blocks whose content is "none" — they carry no inline text. */
const NO_CONTENT = new Set(["divider", "page", "linkToPage", "columnList", "column", "slot"]);

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
    else if (node.type === "link") for (const t of (node as EngineLink).content) out.push(engineTextToSpan(t, (node as EngineLink).href));
  }
  return out;
}

export function toEngine(blocks: SpaceBlock[]): EngineBlock[] {
  return blocks.map((block) => {
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
