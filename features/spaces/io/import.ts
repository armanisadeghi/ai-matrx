// features/spaces/io/import.ts — K2: a Markdown, HTML or CSV file becomes a new Space.
//
// Markdown goes through the one Notion-flavored converter (`notionMarkdownToBlocks`); HTML first becomes
// Markdown through the rich editor's own HTML → Markdown converter (the one every paste uses); a CSV
// becomes one simple table (first row = header). A page's title is its leading `# ` heading (or the
// HTML `<title>` / first `<h1>`), else the file name.

import { notionMarkdownToBlocks } from "@/lib/spaces-blocks/notion-markdown";
import { validateBlocks } from "@/lib/spaces-blocks/schema";

import type { RichSpan, SpaceBlock } from "../contract";

export type ImportKind = "markdown" | "html" | "csv";

export const IMPORT_ACCEPT: Record<ImportKind, string> = {
  markdown: ".md,.markdown,.txt,text/markdown,text/plain",
  html: ".html,.htm,text/html",
  csv: ".csv,text/csv",
};

export interface ImportedPage {
  title: string;
  blocks: SpaceBlock[];
  /** What did not map one-to-one (shown once, as a toast). */
  warnings: string[];
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, "").trim() || "Untitled";

function fromMarkdown(md: string, fallbackTitle: string): ImportedPage {
  let title = fallbackTitle;
  const lines = md.replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim() !== "");
  const heading = first >= 0 ? /^#\s+(.+?)\s*#*\s*$/.exec(lines[first]) : null;
  if (heading) {
    title = heading[1];
    lines.splice(first, 1);
  }
  const { blocks, warnings } = notionMarkdownToBlocks(lines.join("\n"), { idSeed: `import:${crypto.randomUUID()}` });
  return { title, blocks, warnings };
}

async function fromHtml(html: string, fallbackTitle: string): Promise<ImportedPage> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const named = doc.querySelector("title")?.textContent?.trim() || "";
  const [{ getSchema }, { createRichEditorExtensions }, { htmlToMarkdown }] = await Promise.all([
    import("@tiptap/core"),
    import("@/components/rich-editor/core/extensions"),
    import("@/components/rich-editor/core/html-to-markdown"),
  ]);
  const md = htmlToMarkdown(doc.body.innerHTML, getSchema(createRichEditorExtensions()));
  const page = fromMarkdown(md, named || fallbackTitle);
  return named ? { ...page, title: named } : page;
}

async function fromCsv(csv: string, title: string): Promise<ImportedPage> {
  const { parseDelimited } = await import("@ai-matrx/alchemy/operate/read");
  const parsed = parseDelimited(csv.replace(/^﻿/, ""), { skipEmptyLines: true });
  const rows = parsed.data.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ""));
  if (!rows.length) return { title, blocks: [], warnings: ["The file has no rows."] };
  const width = Math.max(...rows.map((r) => r.length));
  const cell = (v: unknown): RichSpan[] => (String(v ?? "") ? [{ text: String(v ?? "") }] : []);
  const table: SpaceBlock = {
    id: crypto.randomUUID(),
    type: "table",
    props: { headerRow: true, headerColumn: false, rows: rows.map((r) => ({ cells: Array.from({ length: width }, (_, i) => cell(r[i])) })) },
  };
  return { title, blocks: [table], warnings: parsed.errors.slice(0, 3).map((e) => `Row ${e.row ?? "?"}: ${e.message}`) };
}

/** Reads one file into a page; throws with the reason when the result would not be a valid Space. */
export async function readImport(file: File, kind: ImportKind): Promise<ImportedPage> {
  const text = await file.text();
  const title = baseName(file.name);
  const page = kind === "markdown" ? fromMarkdown(text, title) : kind === "html" ? await fromHtml(text, title) : await fromCsv(text, title);
  const problems = validateBlocks(page.blocks);
  if (problems.length) throw new Error(`${file.name} could not be imported: ${problems[0]}`);
  return page;
}
