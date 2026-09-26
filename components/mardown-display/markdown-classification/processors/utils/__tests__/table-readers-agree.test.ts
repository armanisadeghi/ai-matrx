/**
 * Every table READER agrees with GFM (verify-RC-B4 R5, one-canonical).
 *
 * The readers below each had a private splitter / delimiter regex / leading-pipe
 * test; they now read through THE rule (gfm-table-lines). Judged here over the
 * shared vector documents (gfm-table-vectors.json — the same the Python block
 * detector reads) against the INDEPENDENT oracle (micromark + remark-gfm,
 * scripts/lib/gfm-table-oracle.ts): a reader finds a table exactly where GFM
 * does, with GFM's header cells and rows.
 *
 * Guard against new private readers: `pnpm check:table-readers`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { oracleTableGrid } from "@/scripts/lib/gfm-table-oracle";
import { parseMarkdownTables } from "@/components/mardown-display/markdown-classification/processors/bock-processors/parse-markdown-table";
import { parseMarkdownTable as tableDataParser } from "@/components/mardown-display/markdown-classification/processors/utils/table-data-parser";
import { parseMarkdownContent } from "@/components/mardown-display/markdown-classification/processors/custom/dynamic-markdown";
import { parseFirstMarkdownTable } from "@/features/rich-document/actions/markdownTable";
import { hasConvertibleContent } from "@/features/agents/components/messages-display/message-options/convertibleContent";
import { parseMarkdownToText } from "@/utils/markdown-processors/parse-markdown-for-speech";
import { getProtectedRegions } from "@/lib/content-cleanup/segment";
import { parseTextSegments } from "@/components/markdown-studio/lab/sync-scroll";

const VECTORS = JSON.parse(readFileSync(resolve(__dirname, "gfm-table-vectors.json"), "utf8")) as {
  documents: Array<{ name: string; text: string }>;
};

describe.each(VECTORS.documents.map((doc) => [doc.name, doc.text] as const))("%s", (_name, text) => {
  const grid = oracleTableGrid(text);
  const isTable = grid !== null;

  it("the chat block processors' table parser finds GFM's table and cells", () => {
    const found = parseMarkdownTables(text).filter((table) => table.markdown);
    expect(found.length > 0).toBe(isTable);
    if (grid) expect(found[0]?.markdown?.headers).toEqual(grid[0]);
  });

  it("the table-data parser reads GFM's header and rows (source cells)", () => {
    const parsed = tableDataParser(text);
    expect(parsed.markdown !== null).toBe(isTable);
    if (grid) expect([parsed.markdown?.headers, ...(parsed.markdown?.rows ?? [])]).toEqual(grid);
  });

  it("the section parser puts GFM's table in its section", () => {
    const tables = parseMarkdownContent(`## Handover\n\n${text}`).sections.flatMap((section) => section.tables);
    expect(tables.length > 0).toBe(isTable);
    if (grid) expect(tables[0]?.data.headers).toEqual(grid[0]);
  });

  it("the rich-document CSV/TSV reader finds the table where GFM does", () => {
    const parsed = parseFirstMarkdownTable(text);
    expect(parsed !== null).toBe(isTable);
    if (grid) expect(parsed?.rows.length).toBe(grid.length - 1);
  });

  it("'convert to table' is offered exactly when GFM reads a table", () => {
    expect(hasConvertibleContent(text)).toBe(isTable);
  });

  it("speech names the table exactly when GFM reads one", () => {
    expect(/There is a table with/.test(parseMarkdownToText(text))).toBe(isTable);
  });

  it("content cleanup protects the table exactly when GFM reads one", () => {
    expect(getProtectedRegions(text).some((region) => region.kind === "table")).toBe(isTable);
  });

  it("the studio's scroll sync sees a table segment exactly when GFM does", () => {
    expect(parseTextSegments(text).some((segment) => segment.type === "table")).toBe(isTable);
  });
});
