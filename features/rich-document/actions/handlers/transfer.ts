// features/rich-document/actions/handlers/transfer.ts
//
// Every way content leaves the page that the best AI apps offer (ChatGPT,
// Claude, Notion AI): copy as Markdown / plain text / rich text / HTML source,
// a table as CSV or TSV, a table into a data table, and a download as a
// standalone HTML page or a PDF. Source-agnostic — any content, anywhere.
// The HTML and PDF paths run through @ai-matrx/print (the one markdown →
// document composition), loaded at click time.

import {
  Code2,
  Database,
  FileCode2,
  FileDown,
  FileText,
  FileType,
  Table2,
  Type,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { copyRichContent, copyContent } from "@ai-matrx/rich-content/copy/copy-commands";
import { hasContentActions } from "@ai-matrx/rich-content/copy/content-view-store";
import { registerAction } from "@ai-matrx/rich-content/rich-document/actions/provider";
import { contentFileName, deriveContentTitle, getErrorMessage, contentForDestination } from "../utils";
import { hasTableShape } from "@ai-matrx/records-ui/table-shape";
import { liveSelectionShapeText } from "@ai-matrx/rich-content/selection-toolbar/selection-shape";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { parseFirstMarkdownTable, tableToDelimited } from "@ai-matrx/rich-content/rich-document/actions/markdownTable";
import type { RichDocumentActionContext } from "@ai-matrx/rich-content/rich-document/types";
import { downloadFile } from "@ai-matrx/kit/download";

async function copyText(text: string, done: string): Promise<void> {
  await copyContent(text, {
    onSuccess: () => toast.success(done),
    onError: (error) => toast.error(getErrorMessage(error, "Failed to copy")),
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  downloadFile(filename, blob, blob.type);
}

function fileBase(ctx: RichDocumentActionContext): string {
  return contentFileName(
    ctx,
    ctx.source.type === "chat-message" ? "message" : ctx.source.type,
  );
}

const hasTable = (ctx: RichDocumentActionContext) =>
  parseFirstMarkdownTable(ctx.content) !== null;

// The two explicit choices beside the one-click Copy (copy.ts): the top rows of "Copy as".
registerAction({
  id: "copy-markdown",
  label: "Copy markdown",
  icon: FileCode2,
  iconColor: "text-slate-500 dark:text-slate-400",
  category: "copy",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 1,
  run: async (ctx) => {
    await copyRichContent(contentForDestination(ctx), "markdown");
  },
});

registerAction({
  id: "copy-plain-text",
  label: "Copy text",
  icon: Type,
  iconColor: "text-slate-500 dark:text-slate-400",
  category: "copy",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 2,
  run: async (ctx) => {
    await copyRichContent(contentForDestination(ctx), "text");
  },
});

registerAction({
  id: "copy-html-source",
  label: "Copy HTML source",
  icon: Code2,
  iconColor: "text-orange-500 dark:text-orange-400",
  category: "copy",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 7,
  run: async (ctx) => {
    try {
      const { markdownToHtml } = await import("@ai-matrx/print/markdown");
      await copyText(markdownToHtml(contentForDestination(ctx)), "HTML copied");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to copy HTML"));
    }
  },
});

registerAction({
  id: "copy-table-csv",
  label: "Copy table as CSV",
  icon: Table2,
  iconColor: "text-emerald-500 dark:text-emerald-400",
  category: "copy",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 8,
  visible: hasTable,
  run: (ctx) => {
    const table = parseFirstMarkdownTable(ctx.content);
    if (!table) return;
    return copyText(tableToDelimited(table, ","), "Table copied as CSV");
  },
});

registerAction({
  // TSV pastes straight into Excel / Sheets / Numbers as cells.
  id: "copy-table-tsv",
  label: "Copy table for a spreadsheet (TSV)",
  icon: Table2,
  iconColor: "text-emerald-500 dark:text-emerald-400",
  category: "copy",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 9,
  visible: hasTable,
  run: (ctx) => {
    const table = parseFirstMarkdownTable(ctx.content);
    if (!table) return;
    return copyText(tableToDelimited(table, "\t"), "Table copied — paste it into a spreadsheet");
  },
});

/**
 * THE ONE "SAVE TO A TABLE" (lane SAVE-AS-TABLE-EVERYWHERE, 2026-09-29). Offered whenever the one
 * shape reader (`hasTableShape`, records-ui) finds rows in what was right-clicked or selected — a
 * table, a list or a few bullets, `Key: value` lines, CSV/TSV, a kind value, JSON rows — and it opens
 * the `saveToTable` overlay: a new table, or rows added to one the person has. No host dialog, no
 * per-surface parse: chat, notes, every RichDocument and the right-click menu reach the same screen.
 */
/**
 * What "Save to a table" saves, in order: a table-shaped selection; the rows the host says the
 * content IS (`callbacks.tableRows` — a transcript's lines, a thread's messages), narrowed to the
 * selection when there is one; the content's own table shape. Null → the action is absent.
 */
const tableSource = (
  ctx: RichDocumentActionContext,
): { text: string } | { rows: ReadonlyArray<Record<string, unknown>> } | null => {
  // BREAKER-3 B3-16: a selection over RENDERED content (a nested list, a table's rows) is read from
  // the selected DOM, which keeps its shape; the flattened words are the fallback.
  const rendered = liveSelectionShapeText();
  if (rendered && hasTableShape(rendered)) return { text: rendered };
  const selected = ctx.applicationScope?.selection;
  if (typeof selected === "string" && hasTableShape(selected)) return { text: selected };
  // A right-click ON a rendered table is about that table — not the first list or table the
  // whole answer holds (a bullet list above it would otherwise win shape 0).
  const clicked = ctx.callbacks?.tableAtTarget?.();
  if (clicked && hasTableShape(clicked)) return { text: clicked };
  const words = typeof selected === "string" && selected.trim() ? selected : null;
  const rows = ctx.callbacks?.tableRows?.(words);
  if (rows && rows.length > 0) return { rows };
  return hasTableShape(ctx.content) ? { text: ctx.content } : null;
};

registerAction({
  id: "save-table-as-data",
  label: "Save to a table…",
  icon: Database,
  iconColor: "text-emerald-500 dark:text-emerald-400",
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 14,
  requiresAuth: true,
  visible: (ctx) => tableSource(ctx) !== null,
  run: (ctx) => {
    const source = tableSource(ctx);
    if (!source) return;
    ctx.onClose();
    ctx.dispatch(
      openOverlay({
        overlayId: "saveToTable",
        instanceId: ctx.instanceKey("save-to-table"),
        data: {
          text: "text" in source ? source.text : null,
          value: "rows" in source ? source.rows : null,
          hasValue: "rows" in source,
          grid: null,
          title: deriveContentTitle(ctx) ?? null,
          shapeIndex: 0,
          organizationId: ctx.organizationId,
          callbackGroupId: null,
        },
      }),
    );
  },
});

registerAction({
  id: "download-html",
  label: "Download as HTML page",
  icon: FileText,
  iconColor: "text-orange-500 dark:text-orange-400",
  category: "export",
  supportedSources: "*",
  renderSlot: "overflow",
  // The ContentActions set in this item's bar already shows it — once per surface.
  visible: (ctx) => !hasContentActions(ctx.instanceKey("alchemy")),
  order: 12,
  run: async (ctx) => {
    try {
      const { renderMarkdownDocument } = await import("@ai-matrx/print/markdown");
      const name = fileBase(ctx);
      const html = renderMarkdownDocument(contentForDestination(ctx), {
        title: name,
      });
      downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${name}.html`);
      toast.success("HTML page downloaded");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to build the HTML page"));
    }
  },
});

registerAction({
  id: "download-pdf",
  label: "Download as PDF",
  icon: FileDown,
  iconColor: "text-red-500 dark:text-red-400",
  category: "export",
  supportedSources: "*",
  renderSlot: "overflow",
  // The ContentActions set in this item's bar already shows it — once per surface.
  visible: (ctx) => !hasContentActions(ctx.instanceKey("alchemy")),
  order: 13,
  run: async (ctx) => {
    const toastId = toast.loading("Generating PDF…");
    try {
      // The print-grade VECTOR PDF (@ai-matrx/print/document): real text,
      // selectable and searchable, a few KB. The old path screenshotted the
      // page into PNGs — a 5-row answer came out at 6.4 MB (RC-B6 verify).
      const { exportDocument } = await import("@ai-matrx/print/document");
      const exp = await exportDocument(contentForDestination(ctx), "pdf", {
        fileName: fileBase(ctx),
      });
      downloadBlob(new Blob([exp.bytes as Uint8Array<ArrayBuffer>], { type: exp.mime }), exp.fileName);
      toast.success("PDF downloaded", { id: toastId });
    } catch (error) {
      toast.error("Failed to create PDF", {
        id: toastId,
        description: getErrorMessage(error, "Unknown error"),
      });
    }
  },
});

registerAction({
  // A real .docx (Word) from the ONE print-grade document tree
  // (@ai-matrx/print/document, RC-B10) — the same tree the PDF/EPUB/HTML
  // exports render from, so headings, tables, captions and frontmatter page
  // setup carry over.
  id: "download-docx",
  label: "Download as Word",
  icon: FileType,
  iconColor: "text-blue-600 dark:text-blue-400",
  category: "export",
  supportedSources: "*",
  renderSlot: "overflow",
  // The ContentActions set in this item's bar already shows it — once per surface.
  visible: (ctx) => !hasContentActions(ctx.instanceKey("alchemy")),
  order: 14,
  run: async (ctx) => {
    const toastId = toast.loading("Building the Word document…");
    try {
      const { exportDocument, downloadDocumentExport } = await import(
        "@ai-matrx/print/document"
      );
      const exp = await exportDocument(contentForDestination(ctx), "docx", {
        fileName: fileBase(ctx),
      });
      downloadDocumentExport(exp);
      const notice = exp.notices[0];
      toast.success("Word document downloaded", {
        id: toastId,
        // An image that could not be embedded, a missing citation… — said,
        // never silently dropped.
        description: notice
          ? `${notice.message} ${notice.remedy}${exp.notices.length > 1 ? ` (+${exp.notices.length - 1} more)` : ""}`
          : undefined,
      });
    } catch (error) {
      toast.error("Failed to build the Word document", {
        id: toastId,
        description: getErrorMessage(error, "Unknown error"),
      });
    }
  },
});
