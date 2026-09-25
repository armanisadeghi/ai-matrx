// features/rich-document/actions/handlers/transfer.ts
//
// Every way content leaves the page that the best AI apps offer (ChatGPT,
// Claude, Notion AI): copy as Markdown / plain text / rich text / HTML source,
// a table as CSV or TSV, a table into a data table, and a download as a
// standalone HTML page or a PDF. Source-agnostic — any content, anywhere.
// The HTML and PDF paths run through @ai-matrx/print (the one markdown →
// document composition), loaded at click time.

import {
  ClipboardType,
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
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { cleanMarkdown } from "@/utils/markdown-processors/clean-markdown-to-text";
import { unwrapKindEnvelopes } from "@/lib/markdown/plain-text";
import { registerAction } from "../registry";
import { contentFileName, getErrorMessage } from "../utils";
import { parseFirstMarkdownTable, tableToDelimited } from "../markdownTable";
import type { RichDocumentActionContext } from "../../types";

async function copyText(text: string, done: string): Promise<void> {
  await copyToClipboard(text, {
    onSuccess: () => toast.success(done),
    onError: (error) => toast.error(getErrorMessage(error, "Failed to copy")),
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fileBase(ctx: RichDocumentActionContext): string {
  return contentFileName(
    ctx,
    ctx.source.type === "chat-message" ? "message" : ctx.source.type,
  );
}

/**
 * Plain text a person would type: envelopes unwrapped, markdown chrome gone,
 * and a pipe table read as tab-separated cells (its `|---|` rule dropped) —
 * never raw table syntax.
 */
function toPlainText(content: string): string {
  const lines = unwrapKindEnvelopes(content).split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(trimmed)) continue;
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      out.push(
        trimmed
          .slice(1, -1)
          .split("|")
          .map((cell) => cell.trim())
          .join("\t"),
      );
      continue;
    }
    out.push(line);
  }
  return cleanMarkdown(out.join("\n"));
}

const hasTable = (ctx: RichDocumentActionContext) =>
  parseFirstMarkdownTable(ctx.content) !== null;

registerAction({
  id: "copy-markdown",
  label: "Copy as Markdown",
  icon: FileCode2,
  iconColor: "text-slate-500 dark:text-slate-400",
  category: "copy",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 4,
  run: (ctx) => copyText(ctx.content, "Markdown copied"),
});

registerAction({
  id: "copy-plain-text",
  label: "Copy as plain text",
  icon: Type,
  iconColor: "text-slate-500 dark:text-slate-400",
  category: "copy",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 5,
  run: (ctx) => copyText(toPlainText(ctx.content), "Plain text copied"),
});

registerAction({
  // Rich text = the rendered HTML AND a plain-text fallback on the clipboard,
  // so pasting into an email, a doc or Slack keeps headings, lists and tables.
  id: "copy-rich-text",
  label: "Copy as rich text",
  icon: ClipboardType,
  iconColor: "text-indigo-500 dark:text-indigo-400",
  category: "copy",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 6,
  run: async (ctx) => {
    try {
      const { markdownToHtml } = await import("@ai-matrx/print/markdown");
      const html = markdownToHtml(ctx.content);
      const plain = cleanMarkdown(ctx.content);
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
        // No rich clipboard in this browser — say so and give the reader the
        // plain text instead of silently copying less than they asked for.
        await copyText(plain, "Copied as plain text (this browser cannot copy rich text)");
        return;
      }
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      toast.success("Rich text copied");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to copy rich text"));
    }
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
      await copyText(markdownToHtml(ctx.content), "HTML copied");
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

registerAction({
  // The canonical "Save as data" dialog (the same one a rendered table's
  // toolbar opens) — the host owns it so it outlives the menu.
  id: "save-table-as-data",
  label: "Save table as a data table",
  icon: Database,
  iconColor: "text-emerald-500 dark:text-emerald-400",
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 14,
  requiresAuth: true,
  visible: (ctx) => Boolean(ctx.callbacks?.onRequestSaveTable) && hasTable(ctx),
  run: (ctx) => {
    const table = parseFirstMarkdownTable(ctx.content);
    if (!table) return;
    ctx.onClose();
    ctx.callbacks?.onRequestSaveTable?.(table);
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
  order: 12,
  run: async (ctx) => {
    try {
      const { renderMarkdownDocument } = await import("@ai-matrx/print/markdown");
      const name = fileBase(ctx);
      const html = renderMarkdownDocument(ctx.content, { title: name });
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
  order: 13,
  run: async (ctx) => {
    const toastId = toast.loading("Generating PDF…");
    try {
      const [{ markdownToPdfBlob }, { markdownToHtml, getMarkdownStylesheet }] =
        await Promise.all([
          import("@ai-matrx/print/pdf"),
          import("@ai-matrx/print/markdown"),
        ]);
      const blob = await markdownToPdfBlob(ctx.content, {
        convertToHtml: markdownToHtml,
        loadCss: getMarkdownStylesheet,
      });
      downloadBlob(blob, `${fileBase(ctx)}.pdf`);
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
  order: 14,
  run: async (ctx) => {
    const toastId = toast.loading("Building the Word document…");
    try {
      const { exportDocument, downloadDocumentExport } = await import(
        "@ai-matrx/print/document"
      );
      const exp = await exportDocument(ctx.content, "docx", {
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
