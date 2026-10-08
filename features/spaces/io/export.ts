// features/spaces/io/export.ts — K1: export a Space as Markdown / HTML (one file, or a zip with its
// sub-pages, Notion's layout: `Title.md` beside a `Title/` folder holding the sub-pages) or PDF (the
// app's print system, @ai-matrx/print: one print window, each sub-page after a page break).

import { PAGE_BREAK_MARKDOWN } from "@ai-matrx/print/markdown";

import { downloadBlob } from "@/utils/file-operations/utils";

import type { SpaceDoc, SpaceId } from "../contract";
import { spaceToMarkdown, type MarkdownContext } from "./markdown";

export type ExportFormat = "markdown" | "html" | "pdf";

export interface ExportSource {
  get: (id: SpaceId) => Promise<SpaceDoc | null>;
  /** Live sub-pages in order (the database's read when the tree has not loaded them). */
  childrenOf: (id: SpaceId) => Array<{ id: SpaceId }> | Promise<Array<{ id: SpaceId }>>;
  titleOf: (id: SpaceId) => string;
}

/** A file / folder name Notion-style: the title, unsafe characters dropped. */
export function safeName(title: string): string {
  return (title || "Untitled").replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";
}

interface Entry {
  doc: SpaceDoc;
  /** Path inside the export, without extension, e.g. "Home/Clients". */
  path: string;
}

async function collect(source: ExportSource, rootId: SpaceId, withChildren: boolean): Promise<Entry[]> {
  const out: Entry[] = [];
  const walk = async (id: SpaceId, dir: string, depth: number) => {
    const doc = await source.get(id);
    if (!doc || doc.isArchived) return;
    // Two siblings with one title get the id's head, so neither file overwrites the other.
    let name = safeName(doc.title);
    if (out.some((e) => e.path === (dir ? `${dir}/${name}` : name))) name = `${name} ${doc.id.slice(0, 8)}`;
    const path = dir ? `${dir}/${name}` : name;
    out.push({ doc, path });
    if (!withChildren || depth >= 16) return;
    for (const kid of await source.childrenOf(id)) await walk(kid.id, path, depth + 1);
  };
  await walk(rootId, "", 0);
  return out;
}

function relative(from: string, to: string): string {
  const a = from.split("/").slice(0, -1);
  const b = to.split("/");
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => ".."), ...b.slice(i)].map(encodeURIComponent).join("/");
}

function contextFor(entry: Entry, all: Entry[], source: ExportSource, ext: string): MarkdownContext {
  const byId = new Map(all.map((e) => [e.doc.id, e]));
  return {
    titleOf: (id) => byId.get(id)?.doc.title ?? source.titleOf(id),
    hrefOf: (id) => {
      const hit = byId.get(id);
      return hit ? `${relative(entry.path, hit.path)}.${ext}` : `${window.location.origin}/spaces/${id}`;
    },
  };
}

/** Runs the export and starts the download (or the print window). Returns what happened, for the toast. */
export async function exportSpace(source: ExportSource, rootId: SpaceId, format: ExportFormat, withChildren: boolean): Promise<string> {
  const entries = await collect(source, rootId, withChildren);
  if (!entries.length) throw new Error("This page could not be read.");
  const root = entries[0];

  if (format === "pdf") {
    const { printMarkdown } = await import("@ai-matrx/print/markdown");
    const markdown = entries
      .map((e) => spaceToMarkdown(e.doc.title, e.doc.blocks, { titleOf: source.titleOf, hrefOf: (id) => `${window.location.origin}/spaces/${id}` }))
      .join(`\n\n${PAGE_BREAK_MARKDOWN}\n\n`);
    const outcome = printMarkdown(markdown, { title: root.doc.title || "Untitled", withPrintActions: true });
    return outcome === "downloaded" ? "The print window was blocked, so the page was downloaded instead" : "Opened for printing";
  }

  const ext = format === "markdown" ? "md" : "html";
  const render = async (e: Entry): Promise<string> => {
    const md = spaceToMarkdown(e.doc.title, e.doc.blocks, contextFor(e, entries, source, ext));
    if (format === "markdown") return md;
    const { renderMarkdownDocument } = await import("@ai-matrx/print/markdown");
    return renderMarkdownDocument(md, { title: e.doc.title || "Untitled" });
  };
  const type = format === "markdown" ? "text/markdown;charset=utf-8" : "text/html;charset=utf-8";

  if (entries.length === 1) {
    downloadBlob(new Blob([await render(root)], { type }), `${root.path}.${ext}`);
    return "Exported";
  }
  const { buildZip } = await import("@ai-matrx/alchemy/operate/zip");
  const zipEntries: { path: string; data: string }[] = [];
  for (const e of entries) zipEntries.push({ path: `${e.path}.${ext}`, data: await render(e) });
  downloadBlob(await buildZip(zipEntries), `${root.path}.zip`);
  return `Exported ${entries.length} pages`;
}
