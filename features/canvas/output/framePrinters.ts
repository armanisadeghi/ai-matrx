"use client";

/**
 * Print adapters for the frame / live artifact types beyond the HTML page
 * (rendered-output P2): one adapter per type in `@ai-matrx/print`'s one
 * block-printer registry, so the canvas tab and the message print agree.
 *
 *   iframe — an external site cannot be printed or captured from here (its
 *            pixels belong to another origin; the capture engine takes record
 *            ids, never client URLs). Inside a message it prints as a link card.
 *   map    — drawn from its spec, tile by tile (`renderStaticMap`), with its
 *            places listed under it.
 *
 * Imported once, by artifact-printers.
 */

import {
  buildPrintDocument,
  openPendingPrintWindow,
  printBlockOutputHtml,
  printHtmlContent,
  registerBlockPrinter,
  type BlockPrinter, type PrintBlockOutput } from "@ai-matrx/print/core";
import { escapeHtml } from "@ai-matrx/kit/html-escape";
import { parseMap } from "@/components/mardown-display/blocks/map/parseMap";
import { renderStaticMap } from "./mapCapture";

/** The external URL an iframe block embeds, or null for an inline (srcDoc) page. */
export function iframeBlockUrl(data: unknown): string | null {
  const value = typeof data === "string" ? data.trim() : (data as { url?: unknown } | null)?.url;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export const EMBEDDED_SITE_REASON = "embedded site — open it to print";
export const EMBEDDED_SITE_CAPTURE_REASON = "embedded site — open it to capture";

function linkCard(url: string, title: string | undefined): string {
  const safe = escapeHtml(url);
  return `<div style="border:1px solid #cbd5e1;border-radius:8px;padding:12px 14px;margin:8px 0;break-inside:avoid">
<div style="font-weight:600;margin-bottom:2px">${escapeHtml(title || "Embedded site")}</div>
<a href="${safe}" style="color:#4338ca;word-break:break-all">${safe}</a>
<div style="color:#64748b;font-size:9pt;margin-top:4px">An embedded site prints as its link. Open it to print the site itself.</div>
</div>`;
}

export const iframePrinter: BlockPrinter = {
  label: "Print link",
  variants: [],
  print(data) {
    const url = iframeBlockUrl(data);
    if (url) printHtmlContent(linkCard(url, undefined), "Embedded site");
  },
  toPrintHtml(data, context): PrintBlockOutput {
    const url = iframeBlockUrl(data) ?? iframeBlockUrl(context.raw);
    if (!url) return { notice: "Embedded page — print it from its card." };
    return { html: linkCard(url, context.title) };
  },
};

async function mapPrintOutput(raw: string, title: string | undefined): Promise<PrintBlockOutput> {
  const spec = parseMap(raw);
  if ("error" in spec) return { notice: `Map not printed: ${spec.error}` };
  const picture = await renderStaticMap(spec);
  const places = spec.markers
    .map(
      (m, i) =>
        `<li><strong>${i + 1}. ${escapeHtml(m.label ?? `${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}`)}</strong>${
          m.description ? ` — ${escapeHtml(m.description)}` : ""
        }</li>`,
    )
    .join("");
  const heading = escapeHtml(spec.title ?? title ?? "Map");
  const figure = picture
    ? `<img src="${picture}" alt="${heading}" style="display:block;width:100%;max-width:720px;height:auto;border:1px solid #cbd5e1;border-radius:6px">`
    : `<div style="border:1px dashed #94a3b8;border-radius:6px;padding:12px;color:#475569;font-style:italic">The map tiles could not load, so the places print as a list.</div>`;
  return {
    html: `<figure style="margin:8px 0;break-inside:avoid"><figcaption style="font-weight:600;margin-bottom:6px">${heading}</figcaption>${figure}</figure><ol style="list-style:none;padding:0;margin:6px 0">${places}</ol>`,
  };
}

export const mapPrinter: BlockPrinter = {
  label: "Print map",
  variants: [],
  async print(data) {
    // The window opens inside the click; the map is drawn into it when its tiles arrive.
    const pending = openPendingPrintWindow("Map");
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    return pending.write(buildPrintDocument(printBlockOutputHtml(await mapPrintOutput(raw, undefined)), "Map"));
  },
  toPrintHtml(data, context) {
    return mapPrintOutput(context.raw || (typeof data === "string" ? data : JSON.stringify(data)), context.title);
  },
};

registerBlockPrinter(["iframe"], iframePrinter);
registerBlockPrinter(["map"], mapPrinter);

// Full Print's map picture (chat `setElementPrintCapture`, published after chat 0.6.0) is plugged
// once that release is installed — the MapBlock already carries `data-matrx-print-picture`.
