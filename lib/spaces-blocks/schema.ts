// lib/spaces-blocks/schema.ts — the block catalog and the validator every snapshot writer runs.
//
// One entry per stored block type: the parity row it copies (PARITY.md § C), whether the editor renders
// it today, what `text` means for it, which children it may hold, and a check of its `props`.

import {
  DATABASE_CHART_OPS,
  DATABASE_CHART_TYPES,
  DATABASE_OPEN_AS,
  DATABASE_VIEW_LAYOUTS,
  BUTTON_ACTION_KINDS,
  RENDERED_BLOCK_TYPES,
  SCHEMA_ONLY_BLOCK_TYPES,
  SPACE_COLORS,
  PAGE_PROPERTY_TYPES,
  type RichSpan,
  type SpaceBlock,
  type SpaceSnapshot,
} from "./types";

type Props = Record<string, unknown> | undefined;
/** Returns a problem sentence, or null when the props are fine. */
type PropsCheck = (props: Props, block: SpaceBlock) => string | null;

export interface BlockSpec {
  type: string;
  parity: string;
  label: string;
  rendered: boolean;
  /** inline = `text` is the block's content; none = the block carries no `text`. */
  text: "inline" | "none";
  /** any = nested blocks allowed; none = no children; column = only `column`; tab = only `tab`; blocks = any but `column` / `tab`. */
  children: "any" | "none" | "column" | "tab" | "blocks";
  props: PropsCheck;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === "string";
const nonEmpty = (v: unknown) => typeof v === "string" && v.length > 0;

const ok: PropsCheck = () => null;

const alignment: PropsCheck = (p) =>
  p?.textAlignment !== undefined && !["left", "center", "right", "justify"].includes(String(p.textAlignment))
    ? "textAlignment must be left, center, right or justify"
    : null;

const textProps: PropsCheck = (p, b) => {
  const u = p?.unsupported;
  if (u !== undefined && (!isObj(u) || !str(u.from) || !str(u.kind) || !str(u.source))) return "props.unsupported must be { from, kind, source } text";
  return alignment(p, b);
};

function spansProblem(spans: unknown, where: string): string | null {
  if (!Array.isArray(spans)) return `${where} must be an array of spans`;
  for (const [i, s] of spans.entries()) {
    const p = spanProblem(s);
    if (p) return `${where}[${i}]: ${p}`;
  }
  return null;
}

const media: PropsCheck = (p) => {
  if (!p) return "needs props.fileId or props.url";
  const has = Number(nonEmpty(p.fileId)) + Number(nonEmpty(p.url));
  if (has !== 1) return "needs exactly one of props.fileId (our file) or props.url";
  if (p.width !== undefined && typeof p.width !== "number") return "width must be a number of px";
  if (p.height !== undefined && typeof p.height !== "number") return "height must be a number of px";
  if (p.align !== undefined && !["left", "center", "right"].includes(String(p.align))) return "align must be left, center or right";
  if (p.name !== undefined && !str(p.name)) return "name must be text";
  if (p.caption !== undefined) return spansProblem(p.caption, "caption");
  return null;
};

const spaceRef: PropsCheck = (p) => (nonEmpty(p?.spaceId) ? null : "needs props.spaceId (the Space it opens)");

const SPECS: BlockSpec[] = [
  { type: "text", parity: "C1", label: "Text", rendered: true, text: "inline", children: "blocks", props: textProps },
  {
    type: "heading",
    parity: "C2",
    label: "Heading 1/2/3/4 (toggle heading when props.toggleable)",
    rendered: true,
    text: "inline",
    children: "blocks",
    props: (p, b) => {
      if (![1, 2, 3, 4].includes(Number(p?.level)) || typeof p?.level !== "number") return "props.level must be 1, 2, 3 or 4";
      if (p.toggleable !== undefined && typeof p.toggleable !== "boolean") return "props.toggleable must be true or false";
      return alignment(p, b);
    },
  },
  { type: "bulleted", parity: "C3", label: "Bulleted list item", rendered: true, text: "inline", children: "blocks", props: alignment },
  { type: "numbered", parity: "C4", label: "Numbered list item", rendered: true, text: "inline", children: "blocks", props: alignment },
  {
    type: "todo",
    parity: "C5",
    label: "To-do",
    rendered: true,
    text: "inline",
    children: "blocks",
    props: (p) => (typeof p?.checked === "boolean" ? null : "props.checked must be true or false"),
  },
  { type: "toggle", parity: "C6", label: "Toggle list", rendered: true, text: "inline", children: "blocks", props: alignment },
  { type: "quote", parity: "C7", label: "Quote", rendered: true, text: "inline", children: "blocks", props: alignment },
  {
    type: "callout",
    parity: "C8",
    label: "Callout",
    rendered: true,
    text: "inline",
    children: "blocks",
    props: (p) => (p?.icon === undefined || str(p.icon) ? null : "props.icon must be a Lucide icon name or empty"),
  },
  { type: "divider", parity: "C9", label: "Divider", rendered: true, text: "none", children: "none", props: ok },
  {
    type: "code",
    parity: "C10",
    label: "Code",
    rendered: true,
    text: "inline",
    children: "none",
    props: (p) => {
      if (p?.language !== undefined && !str(p.language)) return "props.language must be text";
      if (p?.caption !== undefined) return spansProblem(p.caption, "caption");
      return null;
    },
  },
  {
    type: "equation",
    parity: "C11",
    label: "Equation (block)",
    rendered: false,
    text: "none",
    children: "none",
    props: (p) => (str(p?.expression) ? null : "props.expression must hold the KaTeX source"),
  },
  { type: "page", parity: "C12", label: "Page (sub-page)", rendered: true, text: "none", children: "none", props: spaceRef },
  { type: "linkToPage", parity: "C13", label: "Link to page", rendered: true, text: "none", children: "none", props: spaceRef },
  {
    type: "table",
    parity: "C14",
    label: "Simple table",
    rendered: false,
    text: "none",
    children: "none",
    props: (p) => {
      if (typeof p?.headerRow !== "boolean" || typeof p?.headerColumn !== "boolean") return "props.headerRow and props.headerColumn must be true or false";
      if (!Array.isArray(p.rows) || p.rows.length === 0) return "props.rows must hold at least one row";
      for (const [r, row] of (p.rows as unknown[]).entries()) {
        if (!isObj(row) || !Array.isArray(row.cells)) return `rows[${r}] must be { cells: RichSpan[][] }`;
        for (const [c, cell] of (row.cells as unknown[]).entries()) {
          const prob = spansProblem(cell, `rows[${r}].cells[${c}]`);
          if (prob) return prob;
        }
      }
      if (p.columnWidths !== undefined) {
        if (!Array.isArray(p.columnWidths) || Array.from(p.columnWidths).some((w) => w !== null && (typeof w !== "number" || !(w > 0)))) return "props.columnWidths must be a list of positive px widths or null";
      }
      return null;
    },
  },
  { type: "tableOfContents", parity: "C15", label: "Table of contents", rendered: false, text: "none", children: "none", props: ok },
  { type: "breadcrumb", parity: "C16", label: "Breadcrumb", rendered: false, text: "none", children: "none", props: ok },
  { type: "columnList", parity: "C17", label: "Columns", rendered: true, text: "none", children: "column", props: ok },
  {
    type: "column",
    parity: "C17",
    label: "Column",
    rendered: true,
    text: "none",
    children: "blocks",
    props: (p) => (typeof p?.width === "number" && p.width > 0 ? null : "props.width must be a positive fraction"),
  },
  { type: "image", parity: "C20", label: "Image", rendered: false, text: "none", children: "none", props: media },
  { type: "video", parity: "C21", label: "Video", rendered: false, text: "none", children: "none", props: media },
  { type: "audio", parity: "C21", label: "Audio", rendered: false, text: "none", children: "none", props: media },
  { type: "file", parity: "C21", label: "File", rendered: false, text: "none", children: "none", props: media },
  { type: "pdf", parity: "C21", label: "PDF", rendered: false, text: "none", children: "none", props: media },
  {
    type: "bookmark",
    parity: "C22",
    label: "Bookmark",
    rendered: false,
    text: "none",
    children: "none",
    props: (p) => (nonEmpty(p?.url) ? (p?.caption !== undefined ? spansProblem(p.caption, "caption") : null) : "props.url is required"),
  },
  {
    type: "embed",
    parity: "C23",
    label: "Embed",
    rendered: false,
    text: "none",
    children: "none",
    props: (p) => (nonEmpty(p?.url) ? (p?.caption !== undefined ? spansProblem(p.caption, "caption") : null) : "props.url is required"),
  },
  {
    type: "database",
    parity: "C24",
    label: "Database (inline or full page)",
    rendered: false,
    text: "none",
    children: "none",
    props: (p) => {
      if (typeof p?.inline !== "boolean") return "props.inline must be true or false";
      const s = p.source;
      if (!isObj(s)) return "props.source is required";
      if (s.kind === "table") {
        if (!nonEmpty(s.tableId)) return "props.source.tableId is required";
        if (s.viewId !== undefined && !nonEmpty(s.viewId)) return "props.source.viewId must be an id when present";
      } else if (s.kind === "entity") {
        if (!nonEmpty(s.token)) return "props.source.token is required";
      } else return "props.source.kind must be table or entity";
      if (p.title !== undefined && !str(p.title)) return "props.title must be text";
      if (p.sample !== undefined && !str(p.sample)) return "props.sample must be text";
      for (const k of ["linked", "showTitle"]) if (p[k] !== undefined && typeof p[k] !== "boolean") return `props.${k} must be true or false`;
      if (p.openAs !== undefined && !(DATABASE_OPEN_AS as readonly string[]).includes(String(p.openAs))) return "props.openAs must be side, center, page or full";
      if (p.activeViewId !== undefined && !str(p.activeViewId)) return "props.activeViewId must be an id";
      if (p.views !== undefined) {
        if (!Array.isArray(p.views)) return "props.views must be a list";
        for (const [i, v] of (p.views as unknown[]).entries()) {
          const prob = viewProblem(v);
          if (prob) return `views[${i}]: ${prob}`;
        }
      }
      return null;
    },
  },
  {
    type: "tabs",
    parity: "N1",
    label: "Tabs",
    rendered: true,
    text: "none",
    children: "tab",
    props: (p) => (p?.activeTab === undefined || str(p.activeTab) ? null : "props.activeTab must be a tab id"),
  },
  { type: "tab", parity: "N1", label: "Tab (one named tab inside Tabs)", rendered: true, text: "inline", children: "blocks", props: ok },
  {
    type: "synced",
    parity: "C18",
    label: "Synced block (its content is one source Space shared by every copy)",
    rendered: true,
    text: "none",
    children: "none",
    props: (p) => (nonEmpty(p?.sourceId) ? null : "needs props.sourceId (the synced source)"),
  },
  {
    type: "button",
    parity: "C19",
    label: "Button",
    rendered: true,
    text: "none",
    children: "none",
    props: (p) => {
      if (!str(p?.label)) return "props.label must be text";
      if (p?.icon !== undefined && !str(p.icon)) return "props.icon must be a Lucide icon name";
      if (!Array.isArray(p?.actions)) return "props.actions must be a list";
      for (const [i, a] of (p.actions as unknown[]).entries()) {
        if (!isObj(a) || !(BUTTON_ACTION_KINDS as readonly string[]).includes(String(a.kind))) return `actions[${i}].kind must be one of ${BUTTON_ACTION_KINDS.join(", ")}`;
      }
      return null;
    },
  },
  {
    type: "slot",
    parity: "-",
    label: "Builder placeholder (phase-2 block marker)",
    rendered: true,
    text: "none",
    children: "none",
    props: (p) => (str(p?.label) ? null : "props.label must be text"),
  },
  {
    type: "ai",
    parity: "C28",
    label: "AI block (a prompt and the content it generated, in place)",
    rendered: true,
    text: "none",
    children: "none",
    props: (p) => {
      if (typeof p?.prompt !== "string") return "props.prompt must be text";
      if (p.output !== undefined && typeof p.output !== "string") return "props.output must be text (Markdown)";
      if (p.ranAt !== undefined && typeof p.ranAt !== "string") return "props.ranAt must be an ISO time";
      return null;
    },
  },
];

export const BLOCK_SPECS: ReadonlyMap<string, BlockSpec> = new Map(SPECS.map((s) => [s.type, s]));

// The catalog and the type lists must agree (a type added to one and not the other is a bug).
for (const t of [...RENDERED_BLOCK_TYPES, ...SCHEMA_ONLY_BLOCK_TYPES]) {
  if (!BLOCK_SPECS.has(t)) throw new Error(`spaces-blocks: ${t} has no BlockSpec`);
}

function viewProblem(v: unknown): string | null {
  if (!isObj(v)) return "a view must be an object";
  if (!nonEmpty(v.id)) return "id is required";
  if (!str(v.name)) return "name must be text";
  if (!(DATABASE_VIEW_LAYOUTS as readonly string[]).includes(String(v.layout))) return `layout must be one of ${DATABASE_VIEW_LAYOUTS.join(", ")}`;
  for (const k of ["icon"]) if (v[k] !== undefined && !str(v[k])) return `${k} must be text`;
  for (const k of ["groupField", "dateField"]) if (v[k] !== undefined && v[k] !== null && !str(v[k])) return `${k} must be text or null`;
  if (v.sorts !== undefined && (!Array.isArray(v.sorts) || Array.from(v.sorts).some((x) => !isObj(x) || !str(x.field) || (x.direction !== "asc" && x.direction !== "desc")))) return "sorts must be [{ field, direction: asc|desc }]";
  if (v.filters !== undefined && !isObj(v.filters)) return "filters must be an object";
  if (v.hiddenFields !== undefined && (!Array.isArray(v.hiddenFields) || Array.from(v.hiddenFields).some((x) => !str(x)))) return "hiddenFields must be a list of text";
  if (v.chart !== undefined) {
    const c = v.chart;
    if (!isObj(c)) return "chart must be an object";
    if (!(DATABASE_CHART_TYPES as readonly string[]).includes(String(c.type))) return `chart.type must be one of ${DATABASE_CHART_TYPES.join(", ")}`;
    if (!(DATABASE_CHART_OPS as readonly string[]).includes(String(c.op))) return `chart.op must be one of ${DATABASE_CHART_OPS.join(", ")}`;
    if (c.groupBy !== null && !str(c.groupBy)) return "chart.groupBy must be text or null";
    if (c.field !== undefined && c.field !== null && !str(c.field)) return "chart.field must be text or null";
    if (c.sort !== undefined && !["manual", "asc", "desc"].includes(String(c.sort))) return "chart.sort must be manual, asc or desc";
    for (const k of ["legend", "dataLabels", "centerValue"]) if (c[k] !== undefined && typeof c[k] !== "boolean") return `chart.${k} must be true or false`;
  }
  return null;
}

const SPAN_KEYS = new Set(["text", "bold", "italic", "underline", "strike", "code", "color", "background", "link", "mention", "equation", "suggestion"]);
const COLOR_SET = new Set<string>(SPACE_COLORS);

export function spanProblem(s: unknown): string | null {
  if (!isObj(s)) return "a span must be an object";
  if (!str(s.text)) return "span.text must be text";
  for (const k of Object.keys(s)) if (!SPAN_KEYS.has(k)) return `span has no field "${k}"`;
  for (const k of ["bold", "italic", "underline", "strike", "code"]) {
    if (s[k] !== undefined && typeof s[k] !== "boolean") return `span.${k} must be true or false`;
  }
  for (const k of ["color", "background"]) if (s[k] !== undefined && !COLOR_SET.has(String(s[k]))) return `span.${k} is not a Space color`;
  if (s.link !== undefined && !nonEmpty(s.link)) return "span.link must be a URL";
  if (s.equation !== undefined && !str(s.equation)) return "span.equation must be text";
  if (s.suggestion !== undefined) {
    const g = s.suggestion;
    if (!isObj(g) || !nonEmpty(g.id) || (g.kind !== "insert" && g.kind !== "delete") || !nonEmpty(g.by) || !nonEmpty(g.at)) {
      return "span.suggestion must be { id, kind: insert|delete, by, at }";
    }
  }
  if (s.mention !== undefined) {
    const m = s.mention;
    if (!isObj(m)) return "span.mention must be an object";
    if (m.kind === "space" ? !nonEmpty(m.spaceId) : m.kind === "person" ? !nonEmpty(m.userId) : m.kind === "date" ? !nonEmpty(m.iso) : m.kind === "link" ? !nonEmpty(m.url) : true) {
      return "span.mention must be {kind:'space',spaceId} | {kind:'person',userId} | {kind:'date',iso} | {kind:'link',url,title?,icon?}";
    }
    if (m.kind === "link" && ((m.title !== undefined && !str(m.title)) || (m.icon !== undefined && !str(m.icon)))) {
      return "span.mention link title and icon must be text";
    }
  }
  return null;
}

/** Every problem in a block tree, as "path: sentence". Empty = valid. Ids must be unique in the tree. */
export function validateBlocks(blocks: unknown, path = "blocks", seen: Set<string> = new Set()): string[] {
  const out: string[] = [];
  if (!Array.isArray(blocks)) return [`${path} must be an array`];
  if (path === "blocks" && blocks.some((b) => isObj(b) && b.type === "tab")) out.push("blocks: a tab sits only inside tabs");
  for (const [i, raw] of blocks.entries()) {
    const at = `${path}[${i}]`;
    if (!isObj(raw)) {
      out.push(`${at}: a block must be an object`);
      continue;
    }
    const b = raw as unknown as SpaceBlock;
    if (!nonEmpty(b.id)) out.push(`${at}: id is required`);
    else if (seen.has(b.id)) out.push(`${at}: id ${b.id} is used twice`);
    else seen.add(b.id);
    const spec = BLOCK_SPECS.get(b.type);
    if (!spec) {
      out.push(`${at}: "${String(b.type)}" is not a stored block type`);
      continue;
    }
    if (b.color !== undefined && !COLOR_SET.has(b.color)) out.push(`${at}: color is not a Space color`);
    if (b.background !== undefined && !COLOR_SET.has(b.background)) out.push(`${at}: background is not a Space color`);
    if (spec.text === "none" && b.text !== undefined && (b.text as RichSpan[]).length) out.push(`${at}: a ${b.type} block carries no text`);
    if (spec.text === "inline" && b.text !== undefined) {
      const p = spansProblem(b.text, "text");
      if (p) out.push(`${at}: ${p}`);
    }
    if (b.props !== undefined && !isObj(b.props)) out.push(`${at}: props must be an object`);
    else {
      const p = spec.props(b.props, b);
      if (p) out.push(`${at} (${b.type}): ${p}`);
    }
    const kids = b.children ?? [];
    if (b.children !== undefined && !Array.isArray(b.children)) out.push(`${at}: children must be an array`);
    else if (kids.length) {
      if (spec.children === "none") out.push(`${at}: a ${b.type} block holds no children`);
      if (spec.children === "column" && kids.some((k) => k?.type !== "column")) out.push(`${at}: columns hold only column blocks`);
      if (spec.children !== "column" && kids.some((k) => k?.type === "column")) out.push(`${at}: a column sits only inside columnList`);
      if (spec.children === "tab" && kids.some((k) => k?.type !== "tab")) out.push(`${at}: tabs hold only tab blocks`);
      if (spec.children !== "tab" && kids.some((k) => k?.type === "tab")) out.push(`${at}: a tab sits only inside tabs`);
      out.push(...validateBlocks(kids, `${at}.children`, seen));
    }
    if (b.type === "columnList" && kids.length < 2) out.push(`${at}: columns need at least two column blocks`);
  }
  return out;
}

function mediaProblem(m: unknown, where: string, allowOffset: boolean): string | null {
  if (m === null || m === undefined) return null;
  if (!isObj(m)) return `${where} must be { fileId } | { url } | { icon } or null`;
  const keys = ["fileId", "url", "icon"].filter((k) => nonEmpty(m[k]));
  if (keys.length !== 1) return `${where} must name exactly one of fileId, url, icon`;
  if (allowOffset && m.offsetY !== undefined && typeof m.offsetY !== "number") return `${where}.offsetY must be a number`;
  return null;
}

/** Every problem in a whole snapshot. Empty = it may be saved. */
export function validateSnapshot(s: unknown): string[] {
  if (!isObj(s)) return ["the snapshot must be an object"];
  const out: string[] = [];
  if (s.v !== 1) out.push("v must be 1");
  const st = s.settings;
  if (!isObj(st)) out.push("settings is required");
  else {
    if (!["default", "serif", "mono"].includes(String(st.font))) out.push("settings.font must be default, serif or mono");
    for (const k of ["smallText", "fullWidth", "locked"]) if (typeof st[k] !== "boolean") out.push(`settings.${k} must be true or false`);
  }
  const icon = mediaProblem(s.icon, "icon", false);
  if (icon) out.push(icon);
  const cover = mediaProblem(s.cover, "cover", true);
  if (cover) out.push(cover);
  if (s.properties !== undefined) {
    if (!Array.isArray(s.properties)) out.push("properties must be a list");
    else
      for (const [i, prop] of (s.properties as unknown[]).entries()) {
        if (!isObj(prop) || !nonEmpty(prop.id) || typeof prop.name !== "string") out.push(`properties[${i}] needs an id and a name`);
        else if (!(PAGE_PROPERTY_TYPES as readonly string[]).includes(String(prop.type))) out.push(`properties[${i}].type must be one of ${PAGE_PROPERTY_TYPES.join(", ")}`);
        else if (prop.value !== undefined && prop.value !== null && typeof prop.value !== "string" && typeof prop.value !== "number") out.push(`properties[${i}].value must be text, a number or empty`);
      }
  }
  out.push(...validateBlocks(s.blocks));
  return out;
}

export function assertValidSnapshot(s: unknown): asserts s is SpaceSnapshot {
  const problems = validateSnapshot(s);
  if (problems.length) throw new Error(`Not a valid Space snapshot:\n- ${problems.slice(0, 20).join("\n- ")}`);
}
