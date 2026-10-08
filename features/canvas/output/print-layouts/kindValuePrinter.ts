/**
 * THE generic kind-value print layout: any registered kind (`__kind`) value
 * printed from its SCHEMA — the kind's label as the title, field titles as
 * labels, short scalars as a label/value list, long text as paragraphs, URLs
 * as links, arrays of flat records as tables, other arrays as lists or
 * numbered sections, nested objects as sub-sections. Raw JSON never prints.
 *
 * Used for the `kind_value` artifact type, every kind slug no type layout
 * claims, and a ```json fence / `<artifact>` whose body is a kind value. The
 * schema comes from the kind catalog (`kindValidator.cachedSchema`); without
 * one (catalog unreachable, a kind not registered) the same layout runs on the
 * value alone, labels humanised from the keys.
 */

import { getBlockPrinter, type BlockPrinter, type PrintBlockContext } from "@ai-matrx/print/core";
import {
  esc,
  inlineHtml,
  isUrl,
  linkHtml,
  makeLayoutPrinter,
  obj,
  paperHtml,
  parseJsonText,
  str,
  tableHtml,
  textHtml,
  type Layout,
} from "./printKit";

export type JsonSchema = Record<string, unknown>;

const KIND_KEY = "__kind";
const MAX_DEPTH = 7;
const TITLE_KEYS = ["title", "name", "heading", "label", "headline", "question", "term", "keyword", "query", "topic", "text"] as const;
const SUBTITLE_KEYS = ["subtitle", "description", "summary", "tagline"] as const;
const ACRONYMS = new Set(["id", "url", "urls", "seo", "api", "cms", "faq", "ai", "h1", "h2", "h3", "cta", "pdf", "html", "json", "sql", "uuid", "ui", "ux", "kpi", "roi", "cpc", "ctr", "serp", "llm", "csv", "ip", "og", "utm"]);

/** `estimatedTime` / `total_row_count` → "Estimated time" / "Total row count". */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/^_+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower === "urls" ? "URLs" : lower.toUpperCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

// ─── schema walking ───────────────────────────────────────────────────────────

function resolveRef(ref: string, root: JsonSchema | null): JsonSchema | null {
  if (!root || !ref.startsWith("#/")) return null;
  let node: unknown = root;
  for (const part of ref.slice(2).split("/")) {
    node = obj(node)?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    if (node == null) return null;
  }
  return obj(node);
}

/** The schema node with `$ref` followed and `anyOf`/`oneOf` narrowed to its non-null branch. */
export function derefSchema(schema: unknown, root: JsonSchema | null, guard = 0): JsonSchema | null {
  const start = obj(schema);
  if (!start || guard > 12) return start;
  let node: JsonSchema = start;
  if (typeof node.$ref === "string") {
    const target = resolveRef(node.$ref, root);
    const { $ref: _ref, ...rest } = node;
    node = target ? { ...(derefSchema(target, root, guard + 1) ?? {}), ...rest } : rest;
  }
  for (const key of ["anyOf", "oneOf"] as const) {
    const branches: unknown = node[key];
    if (Array.isArray(branches)) {
      const real: JsonSchema | null | undefined = branches
        .map((b: unknown) => derefSchema(b, root, guard + 1))
        .find((b: JsonSchema | null) => !!b && b.type !== "null");
      if (real) {
        const { [key]: _drop, ...rest } = node;
        node = { ...real, ...rest };
      }
    }
  }
  if (Array.isArray(node.allOf)) {
    const merged: JsonSchema = { ...node };
    const props: Record<string, unknown> = { ...(obj(node.properties) ?? {}) };
    for (const part of node.allOf as unknown[]) {
      const resolved = derefSchema(part, root, guard + 1);
      Object.assign(props, obj(resolved?.properties) ?? {});
      for (const [k, v] of Object.entries(resolved ?? {})) if (!(k in merged) && k !== "properties") merged[k] = v;
    }
    delete merged.allOf;
    merged.properties = props;
    node = merged;
  }
  return node;
}

function propertySchema(schema: JsonSchema | null, key: string, root: JsonSchema | null): JsonSchema | null {
  const props = obj(schema?.properties);
  return derefSchema(props?.[key], root);
}

function itemSchema(schema: JsonSchema | null, root: JsonSchema | null): JsonSchema | null {
  return derefSchema(schema?.items, root);
}

/** A field's label: its schema title unless that is just the key re-cased (pydantic does that), else the humanised key. */
function fieldLabel(key: string, schema: JsonSchema | null): string {
  const title = str(schema?.title);
  return title && title.replace(/\s+/g, "").toLowerCase() !== key.replace(/[_\-\s]+/g, "").toLowerCase() ? title : humanizeKey(key);
}

// ─── value classification ─────────────────────────────────────────────────────

type Rec = Record<string, unknown>;

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.every(isEmpty);
  const record = obj(value);
  if (record) return Object.entries(record).every(([k, v]) => k === KIND_KEY || k.startsWith("_") || isEmpty(v));
  return false;
}

/**
 * Field order. A stored schema is `jsonb`, which re-sorts object keys (shortest
 * first), so `properties` order is not the author's order; `required` is an
 * array and keeps it. Title-like fields lead, then `required` order, then the
 * remaining properties, then keys the schema does not name.
 */
function orderedKeys(keys: readonly string[], schema: JsonSchema | null): string[] {
  const required = Array.isArray(schema?.required) ? (schema.required as unknown[]).filter((k): k is string => typeof k === "string") : [];
  const declared = Object.keys(obj(schema?.properties) ?? {});
  const rank = (key: string): number => {
    const title = (TITLE_KEYS as readonly string[]).indexOf(key);
    if (title >= 0) return title;
    const req = required.indexOf(key);
    if (req >= 0) return 100 + req;
    const dec = declared.indexOf(key);
    if (dec >= 0) return 1000 + dec;
    return 10000;
  };
  return keys
    .map((key, index) => ({ key, index }))
    .sort((a, b) => rank(a.key) - rank(b.key) || a.index - b.index)
    .map(({ key }) => key);
}

function visibleEntries(record: Rec, schema: JsonSchema | null): Array<[string, unknown]> {
  return orderedKeys(Object.keys(record), schema)
    .filter((k) => k !== KIND_KEY && !k.startsWith("_") && !isEmpty(record[k]))
    .map((k) => [k, record[k]]);
}

function isLongText(value: unknown): boolean {
  return typeof value === "string" && (value.length > 160 || value.includes("\n") || isCodeText(value));
}

/** A string field whose content is code (JSON, markup): printed as code, never as a sentence. */
function isCodeText(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text.length < 12) return false;
  return parseJsonText(text) != null || (/^<[a-z!?]/i.test(text) && /<\/[a-z]+>\s*$/i.test(text));
}

function codeHtml(text: string): string {
  const json = parseJsonText(text);
  return `<pre>${esc(json != null ? JSON.stringify(json, null, 2) : text.trim())}</pre>`;
}

/** A cell-sized value: scalar, or a short list of scalars. */
function isCellValue(value: unknown): boolean {
  if (isCodeText(value)) return false;
  if (value == null || isScalar(value)) return !isLongText(value) || (typeof value === "string" && value.length <= 400);
  if (Array.isArray(value)) return value.length <= 12 && value.every((v) => v == null || (isScalar(v) && String(v).length <= 80));
  return false;
}

function scalarHtml(value: unknown, schema: JsonSchema | null): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    const format = str(schema?.format);
    if (format === "percent" || (schema?.maximum === 1 && schema?.minimum === 0 && value <= 1)) return `${Math.round(value * 1000) / 10}%`;
    return esc(Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 4 }));
  }
  if (typeof value === "string") {
    if (isUrl(value)) return linkHtml(value);
    const format = str(schema?.format);
    if ((format === "date-time" || format === "date") && !Number.isNaN(Date.parse(value))) {
      const date = new Date(value);
      return esc(format === "date" ? date.toLocaleDateString("en-US", { dateStyle: "medium" }) : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }));
    }
    return inlineHtml(value);
  }
  return esc(value);
}

function cellHtml(value: unknown, schema: JsonSchema | null, root: JsonSchema | null): string {
  if (Array.isArray(value)) {
    const items = itemSchema(schema, root);
    const kept = value.filter((v) => !isEmpty(v));
    if (kept.some((v) => String(v).length > 30)) {
      return `<ul class="matrx-pl-cell-list">${kept.map((v) => `<li>${scalarHtml(v, items)}</li>`).join("")}</ul>`;
    }
    return kept.map((v) => scalarHtml(v, items)).join(", ");
  }
  return value == null ? "" : scalarHtml(value, schema);
}

/** A record's own title: its first title-like field. */
function recordTitle(record: Rec): { key: string; text: string } | null {
  for (const key of TITLE_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim() && value.length <= 200) return { key, text: value };
  }
  return null;
}

// ─── rendering ────────────────────────────────────────────────────────────────

interface Ctx {
  readonly root: JsonSchema | null;
}

function heading(depth: number, html: string): string {
  const level = Math.min(5, depth + 3);
  return `<h${level}>${html}</h${level}>`;
}

/** A value too deep to lay out: one readable line, never JSON. */
function flatText(value: unknown, depth = 0): string {
  if (value == null) return "";
  if (isScalar(value)) return String(value);
  if (depth > 4) return "…";
  if (Array.isArray(value)) return value.map((v) => flatText(v, depth + 1)).filter(Boolean).join("; ");
  const record = obj(value) ?? {};
  return Object.entries(record)
    .filter(([k, v]) => k !== KIND_KEY && !isEmpty(v))
    .map(([k, v]) => `${humanizeKey(k)}: ${flatText(v, depth + 1)}`)
    .join(", ");
}

function arrayHtml(values: unknown[], schema: JsonSchema | null, depth: number, ctx: Ctx): string {
  const items = values.filter((v) => !isEmpty(v));
  if (items.length === 0) return "";
  const itemSch = itemSchema(schema, ctx.root);
  if (items.every(isScalar)) {
    const short = items.every((v) => String(v).length <= 40);
    if (short && items.length <= 6) return `<p>${items.map((v) => scalarHtml(v, itemSch)).join(" · ")}</p>`;
    return `<ul>${items.map((v) => `<li>${isCodeText(v) ? codeHtml(v) : isLongText(v) ? textHtml(v) : scalarHtml(v, itemSch)}</li>`).join("")}</ul>`;
  }
  const records = items.map((v) => obj(v));
  if (records.every((r): r is Rec => !!r)) {
    const columns: string[] = [];
    for (const key of Object.keys(obj(itemSch?.properties) ?? {})) if (records.some((r) => !isEmpty(r[key]))) columns.push(key);
    for (const r of records) for (const key of Object.keys(r)) if (!columns.includes(key) && !isEmpty(r[key])) columns.push(key);
    const visible = orderedKeys(columns, itemSch).filter((k) => k !== KIND_KEY && !k.startsWith("_"));
    const flat = visible.length > 0 && visible.length <= 7 && records.every((r) => visible.every((k) => isCellValue(r[k])));
    if (flat) {
      const headers = visible.map((k) => esc(fieldLabel(k, propertySchema(itemSch, k, ctx.root))));
      const rows = records.map((r) => visible.map((k) => cellHtml(r[k], propertySchema(itemSch, k, ctx.root), ctx.root)));
      return tableHtml(headers, rows);
    }
    return records
      .map((r, index) => {
        const own = recordTitle(r);
        const label = own ? inlineHtml(own.text) : `${esc(str(itemSch?.title) ?? "Item")} ${index + 1}`;
        const rest: Rec = { ...r };
        if (own) delete rest[own.key];
        const body = objectHtml(rest, itemSch, depth + 1, ctx);
        return `<div class="matrx-pl-card${body.length > 1800 ? " matrx-pl-long" : ""}">${heading(depth + 1, `${own ? `${index + 1}. ` : ""}${label}`)}${body}</div>`;
      })
      .join("");
  }
  return `<ul>${items.map((v) => `<li>${valueHtml(v, itemSch, depth + 1, ctx)}</li>`).join("")}</ul>`;
}

function valueHtml(value: unknown, schema: JsonSchema | null, depth: number, ctx: Ctx): string {
  if (value == null) return "";
  if (isCodeText(value)) return codeHtml(value);
  if (isScalar(value)) return isLongText(value) ? textHtml(value) : scalarHtml(value, schema);
  if (depth > MAX_DEPTH) return `<p>${esc(flatText(value))}</p>`;
  if (Array.isArray(value)) return arrayHtml(value, schema, depth, ctx);
  const record = obj(value);
  return record ? objectHtml(record, schema, depth, ctx) : esc(value);
}

/** A record: short scalars as one label/value list, then each long or nested field as a sub-section. */
export function objectHtml(record: Rec, schema: JsonSchema | null, depth: number, ctx: Ctx): string {
  if (depth > MAX_DEPTH) return `<p>${esc(flatText(record))}</p>`;
  const short: Array<[string, string]> = [];
  const blocks: string[] = [];
  for (const [key, value] of visibleEntries(record, schema)) {
    const sch = propertySchema(schema, key, ctx.root);
    const label = fieldLabel(key, sch);
    if ((isScalar(value) && !isLongText(value)) || (Array.isArray(value) && value.every(isScalar) && value.length <= 6 && value.every((v) => String(v).length <= 40))) {
      short.push([label, cellHtml(value, sch, ctx.root)]);
    } else {
      const body = valueHtml(value, sch, depth + 1, ctx);
      if (body) blocks.push(`${heading(depth, esc(label))}${body}`);
    }
  }
  const kv = short.length ? `<dl class="matrx-pl-kv">${short.map(([l, v]) => `<dt>${esc(l)}</dt><dd>${v}</dd>`).join("")}</dl>` : "";
  return kv + blocks.join("");
}

/** A kind value → print HTML. Pure: the schema is passed in (null = infer from the value). */
export function renderKindValueHtml(value: Rec, schema: JsonSchema | null, kindLabel?: string | null): string {
  const root = schema;
  const top = derefSchema(schema, root);
  const ctx: Ctx = { root };
  const own = recordTitle(value);
  const titleKey = own && (own.key === "title" || own.key === "name" || own.key === "heading" || own.key === "headline") ? own.key : null;
  const kind = str(value[KIND_KEY]);
  const label = str(kindLabel) ?? str(top?.title) ?? (kind ? humanizeKey(kind.replace(/^table:.*/, "table")) : "Details");
  const title = titleKey ? String(value[titleKey]) : label;
  let subtitleKey: string | null = null;
  for (const key of SUBTITLE_KEYS) {
    const v = value[key];
    if (typeof v === "string" && v.trim() && v.length <= 400) {
      subtitleKey = key;
      break;
    }
  }
  const rest: Rec = { ...value };
  if (titleKey) delete rest[titleKey];
  if (subtitleKey) delete rest[subtitleKey];
  const eyebrow = titleKey && label !== title ? `<div class="matrx-pl-eyebrow">${esc(label)}</div>` : "";
  const body = objectHtml(rest, top, 0, ctx);
  const html = paperHtml(title, subtitleKey ? String(value[subtitleKey]) : null, body || `<p class="matrx-pl-muted">${esc(label)} has no fields filled in.</p>`);
  return eyebrow ? html.replace('<section class="matrx-pl">', `<section class="matrx-pl">${eyebrow}`) : html;
}

// ─── the printer ──────────────────────────────────────────────────────────────

/** A kind value in any stored form (object, JSON text, a fenced JSON body). */
export function readKindValue(data: unknown): Rec | null {
  const record = obj(data) ?? obj(parseJsonText(data));
  return record && typeof record[KIND_KEY] === "string" && record[KIND_KEY] ? record : null;
}

const SCHEMA_WAIT_MS = 4000;

interface KindSchemaInfo {
  schema: JsonSchema | null;
  label: string | null;
}

async function loadKindSchema(kind: string): Promise<KindSchemaInfo> {
  try {
    const { kindValidator } = await import("@/features/content-ir/registry/kind-schema-source");
    const schema = await Promise.race([
      kindValidator.cachedSchema(kind),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SCHEMA_WAIT_MS)),
    ]);
    const node = obj(schema);
    return { schema: node, label: str(node?.title) };
  } catch (error) {
    console.warn(`[print-layouts] the "${kind}" schema could not be read; the value prints with labels from its keys`, error);
    return { schema: null, label: null };
  }
}

/** Overridable for tests and non-app hosts. */
let schemaSource: (kind: string) => Promise<KindSchemaInfo> = loadKindSchema;
export function setKindSchemaSourceForPrint(source: (kind: string) => Promise<KindSchemaInfo>): () => void {
  const previous = schemaSource;
  schemaSource = source;
  return () => {
    schemaSource = previous;
  };
}

const kindValueLayout: Layout<Rec> = {
  label: "Print",
  read: (data) => readKindValue(data),
  title: (m, c) => str(recordTitle(m)?.text) ?? str(c.title) ?? humanizeKey(String(m[KIND_KEY])),
  render: async (m) => {
    const kind = String(m[KIND_KEY]);
    const { schema, label } = await schemaSource(kind);
    return renderKindValueHtml(m, schema, label);
  },
};

export const kindValuePrinter: BlockPrinter = makeLayoutPrinter(kindValueLayout, "kind_value");

/**
 * A ```json fence / `kind_value` block: a kind value goes to its kind's own
 * printer (a quiz as a quiz) or the generic layout; anything else returns null
 * so the default path prints it.
 */
export const kindDispatchPrinter: BlockPrinter = {
  label: "Print",
  variants: [],
  print(data, variantId, settings) {
    const value = readKindValue(data);
    const own = value ? getBlockPrinter(String(value[KIND_KEY])) : undefined;
    const target = own && own !== kindDispatchPrinter ? own : kindValuePrinter;
    return target.print(value ?? data, variantId, settings);
  },
  toPrintHtml(data, context: PrintBlockContext) {
    const value = readKindValue(data);
    if (!value) return null;
    const kind = String(value[KIND_KEY]);
    const own = getBlockPrinter(kind);
    if (own && own !== kindDispatchPrinter && own.toPrintHtml) {
      const answer = own.toPrintHtml(value, { ...context, type: kind });
      // A kind printer that does not read this value falls through to the generic layout.
      if (answer instanceof Promise) return answer.then((a) => a ?? kindValuePrinter.toPrintHtml!(value, context));
      if (answer) return answer;
    }
    return kindValuePrinter.toPrintHtml!(value, context);
  },
};
