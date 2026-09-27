/**
 * Context bundles — the ONE way a surface packs what an agent sees up front.
 *
 * THE CONTEXT BUDGET (Arman, 2026-09-27): give the agent what the page's
 * likely jobs need in the fewest tokens, as one well-prepared XML bundle,
 * instead of many small values or raw JSON rows. A scope builder calls these
 * pure helpers with state the page already rendered (never fetches).
 *
 * Rules the helpers enforce:
 * - empty parts are omitted entirely, never rendered as blank elements;
 * - attributes over nested elements for scalar fields; no indentation;
 * - a clipped text says so (`clipped="true" total_chars="N"`) so the agent
 *   knows the rest is one lookup away and never mistakes a cut for the end.
 *
 * Worked example: `features/marketing/lib/surface-context.ts`.
 */

export type XmlAttrValue = string | number | boolean | null | undefined;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** ` a="1" b="x"` — null, undefined, and blank strings are omitted. */
export function xmlAttrs(attrs: Record<string, XmlAttrValue> = {}): string {
  let out = "";
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (!text) continue;
    out += ` ${name}="${escapeXml(text)}"`;
  }
  return out;
}

/**
 * `<tag attrs>children</tag>`. `children` are already-built XML strings;
 * empty ones are dropped. An element with no attributes and no children
 * renders as "" (omitted), so callers can build freely and skip nothing.
 */
export function xmlElement(
  tag: string,
  attrs: Record<string, XmlAttrValue> = {},
  children: ReadonlyArray<string | null | undefined> | string | null = null,
): string {
  const a = xmlAttrs(attrs);
  const list = typeof children === "string" ? [children] : (children ?? []);
  const body = list.filter((c): c is string => typeof c === "string" && c.length > 0).join("\n");
  if (!a && !body) return "";
  return body ? `<${tag}${a}>${body}</${tag}>` : `<${tag}${a}/>`;
}

/** Cut `text` to at most `max` chars; reports whether it cut and the full length. */
export function clipText(
  text: string,
  max: number,
): { text: string; clipped: boolean; totalChars: number } {
  const totalChars = text.length;
  if (totalChars <= max) return { text, clipped: false, totalChars };
  return { text: text.slice(0, Math.max(0, max)), clipped: true, totalChars };
}

/**
 * A text element clipped to `max` chars. When cut, it carries
 * `clipped="true" total_chars="N"` so the agent knows to look the rest up.
 */
export function xmlText(
  tag: string,
  text: string | null | undefined,
  options: { max?: number; attrs?: Record<string, XmlAttrValue> } = {},
): string {
  if (typeof text !== "string" || !text.trim()) return "";
  const { text: body, clipped, totalChars } =
    options.max === undefined
      ? { text, clipped: false, totalChars: text.length }
      : clipText(text, options.max);
  const a = xmlAttrs({
    ...options.attrs,
    ...(clipped ? { clipped: true, total_chars: totalChars } : {}),
  });
  return `<${tag}${a}>${escapeXml(body)}</${tag}>`;
}

/**
 * A list of rows as one element: `<items total="N" shown="M">…</items>`.
 * Rows beyond `maxRows` are dropped and counted, never silently lost.
 */
export function xmlList<T>(
  tag: string,
  rows: ReadonlyArray<T>,
  renderRow: (row: T) => string,
  options: { maxRows?: number; attrs?: Record<string, XmlAttrValue> } = {},
): string {
  const shown = options.maxRows === undefined ? rows : rows.slice(0, options.maxRows);
  return xmlElement(
    tag,
    {
      ...options.attrs,
      total: rows.length,
      ...(shown.length < rows.length ? { shown: shown.length } : {}),
    },
    shown.map(renderRow),
  );
}
