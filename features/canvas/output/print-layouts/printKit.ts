/**
 * The shared paper kit for structured print layouts: one light paper theme
 * (vector text, sensible page breaks), the HTML helpers every layout uses, and
 * `makeLayoutPrinter`, which turns "recognise the data → render HTML" into a
 * `BlockPrinter` for `@ai-matrx/print`'s one block-printer registry.
 *
 * Recognition is SYNCHRONOUS and rendering may be async: `toPrintHtml` returns
 * `null` at once for data the layout does not read (the default path runs —
 * markdown prose in a message, the drawn DOM in a canvas tab), and a Promise
 * only for data it does. The canvas tab's probe (`artifactPrinterFor`) relies
 * on exactly that.
 */

import {
  buildPrintDocument,
  openPendingPrintWindow,
  type BlockPrinter,
  type PrintBlockContext,
} from "@ai-matrx/print/core";
import { escapeHtml } from "@ai-matrx/kit/html-escape";

export const esc = (value: unknown): string => escapeHtml(value == null ? "" : String(value));

/**
 * Scoped under `.matrx-pl`. A composed print sanitizes block HTML (no `<style>`, no inline
 * styles, only `matrx-*` classes survive), so the sheet travels as the output's `css` and the
 * composer puts it in the document head; the block's own window gets it inline.
 */
export const PAPER_CSS = `
.matrx-pl{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:10.5pt;line-height:1.5;color:#1a1a1a;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0 0 14pt}
.matrx-pl *{box-sizing:border-box}
.matrx-pl .matrx-pl-title{font-size:16pt;font-weight:700;margin:0 0 3pt;padding:0;border:0;color:#0f172a;break-after:avoid;page-break-after:avoid}
.matrx-pl .matrx-pl-sub{color:#475569;margin:0 0 10pt}
.matrx-pl h3{font-size:12.5pt;font-weight:650;margin:14pt 0 5pt;padding:0 0 2pt;border:0;border-bottom:1px solid #e2e8f0;color:#0f172a;break-after:avoid;page-break-after:avoid}
.matrx-pl h4{font-size:11pt;font-weight:600;margin:9pt 0 3pt;color:#1e293b;break-after:avoid;page-break-after:avoid}
.matrx-pl h5{font-size:10pt;font-weight:600;margin:7pt 0 2pt;color:#334155;text-transform:none;break-after:avoid;page-break-after:avoid}
.matrx-pl p{margin:0 0 6pt}
.matrx-pl ul,.matrx-pl ol{margin:0 0 7pt;padding-left:16pt}
.matrx-pl li{margin:1pt 0;break-inside:avoid;page-break-inside:avoid}
.matrx-pl table{width:100%;border-collapse:collapse;margin:4pt 0 10pt;font-size:9.5pt;page-break-inside:auto}
.matrx-pl thead{display:table-header-group}
.matrx-pl tr{break-inside:avoid;page-break-inside:avoid}
.matrx-pl th{background:#f1f5f9;color:#0f172a;text-align:left;font-weight:600;border:1px solid #cbd5e1;padding:4pt 6pt;vertical-align:bottom}
.matrx-pl td{border:1px solid #e2e8f0;padding:4pt 6pt;vertical-align:top;background:#fff}
.matrx-pl tr:nth-child(even) td{background:#fafbfc}
.matrx-pl .matrx-pl-card{border:1px solid #e2e8f0;border-radius:6px;padding:7pt 10pt;margin:6pt 0;break-inside:avoid;page-break-inside:avoid;background:#fff}
.matrx-pl .matrx-pl-card.matrx-pl-long{break-inside:auto;page-break-inside:auto}
.matrx-pl dl.matrx-pl-kv{display:grid;grid-template-columns:minmax(80pt,max-content) 1fr;gap:2pt 12pt;margin:0 0 7pt}
.matrx-pl dl.matrx-pl-kv dt{font-weight:600;color:#334155}
.matrx-pl dl.matrx-pl-kv dd{margin:0;min-width:0;overflow-wrap:anywhere}
.matrx-pl .matrx-pl-muted{color:#64748b}
.matrx-pl .matrx-pl-small{font-size:9pt}
.matrx-pl .matrx-pl-tag{display:inline-block;border:1px solid #cbd5e1;border-radius:8pt;padding:0 5pt;font-size:8.5pt;color:#334155;margin:0 3pt 2pt 0;white-space:nowrap}
.matrx-pl .matrx-pl-check{display:inline-block;width:10pt;font-family:'Segoe UI Symbol','Apple Symbols',sans-serif}
.matrx-pl .matrx-pl-bar{height:5pt;background:#e2e8f0;border-radius:3pt;overflow:hidden;margin:2pt 0 6pt}
.matrx-pl .matrx-pl-bar>span{display:block;height:100%;background:#2563eb}
.matrx-pl a{color:#1d4ed8;text-decoration:underline;overflow-wrap:anywhere}
.matrx-pl code{font-family:'SF Mono',Menlo,Consolas,monospace;font-size:9pt;background:#f1f5f9;padding:0 2pt;border-radius:2pt}
.matrx-pl pre{font-family:'SF Mono',Menlo,Consolas,monospace;font-size:8.5pt;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4pt;padding:6pt 8pt;white-space:pre-wrap;overflow-wrap:anywhere;margin:3pt 0 7pt}
.matrx-pl .matrx-pl-text>:last-child{margin-bottom:0}
.matrx-pl .matrx-pl-eyebrow{color:#64748b;font-size:8.5pt;text-transform:uppercase;letter-spacing:.04em}
.matrx-pl ul.matrx-pl-plain{list-style:none;padding-left:2pt}
.matrx-pl ul.matrx-pl-plain.matrx-pl-indent{padding-left:14pt}
.matrx-pl li.matrx-pl-section-li{margin-top:5pt}
.matrx-pl ul.matrx-pl-cell-list{margin:0;padding-left:11pt}
.matrx-pl .matrx-pl-big{font-size:13pt;font-weight:700}
.matrx-pl .matrx-pl-line{border-bottom:1px solid #94a3b8;height:16pt;margin:4pt 0}
.matrx-pl .matrx-pl-line+.matrx-pl-line{margin-bottom:8pt}
${Array.from({ length: 21 }, (_, i) => `.matrx-pl .matrx-pl-bar>span.matrx-pl-w${i * 5}{width:${i * 5}%}`).join("\n")}
`;

const URL_RE = /^https?:\/\/\S+$/i;
const MARKDOWN_HINT = /(\*\*|__|`|\[[^\]]+\]\([^)]+\)|^\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s))/m;

export function isUrl(value: unknown): boolean {
  return typeof value === "string" && URL_RE.test(value.trim());
}

export function linkHtml(url: string, label?: string | null): string {
  const href = url.trim();
  return `<a href="${esc(href)}">${esc(label?.trim() || href)}</a>`;
}

/** A tiny, safe inline-markdown pass (bold, italic, code, links) for short labels. */
export function inlineHtml(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (isUrl(text)) return linkHtml(text);
  let html = esc(text);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label: string, href: string) => `<a href="${href}">${label}</a>`);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return html;
}

/**
 * A block of prose. Markdown is converted by the print package's markdown
 * converter when it is loaded (`loadMarkdown`); until then — and for plain
 * text — paragraphs keep their line breaks.
 */
export function textHtml(value: unknown): string {
  const text = value == null ? "" : String(value).trim();
  if (!text) return "";
  if (isUrl(text)) return `<p>${linkHtml(text)}</p>`;
  if (markdownConverter && MARKDOWN_HINT.test(text)) {
    return `<div class="matrx-pl-text">${markdownConverter(text)}</div>`;
  }
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${inlineHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

let markdownConverter: ((markdown: string) => string) | null = null;

/** Loads the print package's markdown converter once (lazy: it is a large module). */
export async function loadMarkdown(): Promise<void> {
  if (markdownConverter) return;
  try {
    const { markdownToHtml } = await import("@ai-matrx/print/markdown");
    markdownConverter = (markdown) => markdownToHtml(markdown);
  } catch (error) {
    console.error("[print-layouts] the markdown converter could not load; prose prints as plain text", error);
  }
}

export function listHtml(items: readonly unknown[], ordered = false): string {
  const rows = items.filter((item) => item != null && String(item).trim() !== "");
  if (rows.length === 0) return "";
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${rows.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</${tag}>`;
}

export function kvHtml(rows: ReadonlyArray<readonly [string, string | null | undefined]>): string {
  const kept = rows.filter(([, value]) => value != null && value !== "");
  if (kept.length === 0) return "";
  return `<dl class="matrx-pl-kv">${kept.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${value}</dd>`).join("")}</dl>`;
}

export function tableHtml(headers: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  if (headers.length === 0 || rows.length === 0) return "";
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${headers.map((_, i) => `<td>${row[i] ?? ""}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

export function tagsHtml(tags: readonly unknown[] | null | undefined): string {
  if (!tags?.length) return "";
  return tags
    .filter((tag) => tag != null && String(tag).trim() !== "")
    .map((tag) => `<span class="matrx-pl-tag">${esc(tag)}</span>`)
    .join("");
}

export function checkHtml(checked: boolean): string {
  return `<span class="matrx-pl-check">${checked ? "&#9745;" : "&#9744;"}</span>`;
}

export function paperHtml(title: string | null | undefined, subtitle: string | null | undefined, inner: string): string {
  const head = title?.trim() ? `<h2 class="matrx-pl-title">${inlineHtml(title)}</h2>` : "";
  const sub = subtitle?.trim() ? `<div class="matrx-pl-sub">${textHtml(subtitle)}</div>` : "";
  return `<section class="matrx-pl">${head}${sub}${inner}</section>`;
}

/** A string, when the value is one with content. */
export function str(value: unknown): string | null {
  if (typeof value === "string") return value.trim() ? value : null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Parsed JSON when the text is a JSON object/array, else null. */
export function parseJsonText(value: unknown): unknown {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/^```[a-z]*\s*\n([\s\S]*?)\n?```$/i, "$1").trim();
  if (!(text.startsWith("{") || text.startsWith("["))) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export interface Layout<T> {
  /** Print-button tooltip. */
  readonly label: string;
  /** The data this layout reads, or null — SYNCHRONOUS (the canvas probe depends on it). */
  readonly read: (data: unknown, context: PrintBlockContext) => T | null;
  /** The printed document's title. */
  readonly title: (model: T, context: PrintBlockContext) => string;
  /** Body HTML (escape what you interpolate). Prose helpers already have markdown loaded. */
  readonly render: (model: T, context: PrintBlockContext) => string | Promise<string>;
}

async function renderPaper<T>(layout: Layout<T>, model: T, context: PrintBlockContext): Promise<string> {
  await loadMarkdown();
  return layout.render(model, context);
}

/** One `BlockPrinter` from a layout — the same HTML for the block's own Print and inside a message's Print. */
export function makeLayoutPrinter<T>(layout: Layout<T>, fallbackType: string): BlockPrinter {
  return {
    label: layout.label,
    variants: [],
    print(data: unknown) {
      const context: PrintBlockContext = { type: fallbackType, raw: typeof data === "string" ? data : "" };
      const model = layout.read(data, context);
      const title = model ? layout.title(model, context) : "Print";
      // Opened inside the click (popup blockers allow it); written once the layout is ready.
      const pending = openPendingPrintWindow(title || "print");
      if (!model) {
        return pending.write(buildPrintDocument(paperHtml(title, null, "<p>This content has nothing to print.</p>"), title, PAPER_CSS));
      }
      return renderPaper(layout, model, context).then(
        (html) => pending.write(buildPrintDocument(html, title, PAPER_CSS)),
        (error: unknown) => {
          console.error("[print-layouts] layout failed", error);
          return pending.write(buildPrintDocument(paperHtml(title, null, "<p>This content could not be laid out for print.</p>"), title, PAPER_CSS));
        },
      );
    },
    toPrintHtml(data: unknown, context: PrintBlockContext) {
      const model = layout.read(data, context);
      if (!model) return null;
      return renderPaper(layout, model, context).then((html) => ({ html, css: PAPER_CSS }));
    },
  };
}
