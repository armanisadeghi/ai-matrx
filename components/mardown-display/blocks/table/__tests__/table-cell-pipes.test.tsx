/**
 * Chat answer tables use GFM's ONE cell rule — the same as Studio (verify-RC-B4 R5-2).
 *
 * GFM splits a row into cells FIRST and then unescapes the `\|` that kept a pipe
 * inside a cell — inside code spans too (spec example 200). Studio does this with
 * remark-table-code-pipes; the chat/artifact table renders each cell through the
 * inline core, where no table exists, so `err\|warn` in code kept its backslash.
 * Both now go through unescapeCellPipes (components/markdown-core/syntax/gfm-cell-pipes.ts).
 *
 * Seam: the REAL StreamingTableRenderer (what TableArtifact and the chat table
 * block render) over real markdown with the real core — only redux/toast/overlay
 * hooks are stubbed.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/dynamic", () => {
  const react = jest.requireActual("react") as typeof React;
  return (loader: () => Promise<{ default?: React.ComponentType } | React.ComponentType>) => {
    const Lazy = react.lazy(async () => {
      const mod = await loader();
      return {
        default:
          (mod as { default?: React.ComponentType }).default ??
          (mod as React.ComponentType),
      };
    });
    return function DynamicBoundary(props: Record<string, unknown>) {
      return react.createElement(react.Suspense, { fallback: null }, react.createElement(Lazy, props));
    };
  };
});
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => undefined,
}));
jest.mock("@/hooks/useToastManager", () => ({
  __esModule: true,
  useToastManager: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn(), notify: jest.fn() }),
  default: () => ({}),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/features/overlays/openers/tableViewerWindow", () => ({
  useOpenTableViewerWindow: () => jest.fn(),
}));
(globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};


import { StreamingTableRenderer } from "@/components/mardown-display/blocks/table/StreamingTableRenderer";
import { MarkdownStreamingProvider } from "@/components/markdown-core/streaming-context";

// A log-routing sheet: which alert pattern each channel watches.
const TABLE = [
  "| Channel | Pattern | Note |",
  "| --- | --- | --- |",
  "| ops-alerts | `err\\|warn` | matches either level |",
  "| audit | `a \\| b` and err\\|warn | pipe in code and in text |",
].join("\n");

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("shows a cell's escaped pipe as a pipe — in code and in text — like Studio", async () => {
  await act(async () => {
    root.render(
      <MarkdownStreamingProvider value={false}>
        <StreamingTableRenderer content={TABLE} isStreamActive={false} />
      </MarkdownStreamingProvider>,
    );
  });
  const codes = Array.from(container.querySelectorAll("td code")).map((el) => el.textContent);
  expect(codes).toEqual(["err|warn", "a | b"]);
  const cells = Array.from(container.querySelectorAll("tbody td")).map((el) => el.textContent ?? "");
  expect(cells.some((text) => text.includes("\\|"))).toBe(false);
  expect(cells.join(" ")).toContain("and err|warn");
});

// ── verify-RC-B4 R6-1: a cell is INLINE content ──────────────────────────────
// `> 90%` / `- n/a` / `# 3` are text in a GFM cell. The chat/artifact/Studio
// table renders every cell through the core at the inline level AS A GFM CELL;
// what a reader sees must equal GFM's own rendering of the same table (the
// independent oracle, micromark + remark-gfm), with GFM's `\|` rule applied.
import { oracleTableText } from "@/scripts/lib/gfm-table-oracle";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BLOCK_SYNTAX_CELLS = [
  "> 90%",
  "- n/a",
  "* see note",
  "+ extra",
  "1. first",
  "2) second",
  "# 3",
  "## Bay B3",
  "---",
  "***",
  "```",
  "~~~",
  "[yard]: https://example.com/yard",
  "**Omar** re-scans `B3`",
  "err\\|warn",
];

async function renderedCells(table: string): Promise<string[][]> {
  await act(async () => {
    root.render(
      <MarkdownStreamingProvider value={false}>
        <StreamingTableRenderer content={table} isStreamActive={false} />
      </MarkdownStreamingProvider>,
    );
  });
  // An empty cell shows a muted dash placeholder (data-empty-cell): it reads as "".
  const text = (el: Element) => (el.querySelector("[data-empty-cell]") ? "" : (el.textContent ?? "").trim());
  const header = Array.from(container.querySelectorAll("thead th")).map(text).filter((cell) => cell !== "");
  const rows = Array.from(container.querySelectorAll("tbody tr")).map((tr) => Array.from(tr.querySelectorAll("td")).map(text));
  return [header, ...rows];
}

/** GFM's display text for the table, with the spec's `\|`-in-code rule (micromark keeps the backslash). */
const gfmDisplay = (table: string) => (oracleTableText(table) ?? []).map((row) => row.map((cell) => cell.replace(/\\\|/g, "|")));

it.each(BLOCK_SYNTAX_CELLS)("a data cell %j shows exactly what GFM shows", async (cell) => {
  const table = `| Bay | Note |\n| --- | --- |\n| B3 | ${cell} |`;
  const got = await renderedCells(table);
  expect(got[1]?.slice(0, 2)).toEqual(gfmDisplay(table)[1]);
});

it.each(BLOCK_SYNTAX_CELLS)("a header cell %j shows exactly what GFM shows", async (cell) => {
  const table = `| ${cell} | Note |\n| --- | --- |\n| B3 | ok |`;
  const got = await renderedCells(table);
  expect(got[0]?.slice(0, 2)).toEqual(gfmDisplay(table)[0]);
});

it("every table in the shared vectors renders cell-for-cell as GFM does", async () => {
  const vectors = JSON.parse(
    readFileSync(resolve(__dirname, "../../../markdown-classification/processors/utils/__tests__/gfm-table-vectors.json"), "utf8"),
  ) as { tables: Array<{ table: string; notATable?: boolean }> };
  for (const { table, notATable } of vectors.tables) {
    if (notATable) continue;
    const want = gfmDisplay(table);
    const got = await renderedCells(table);
    expect({ table, cells: got.slice(0, want.length).map((row, r) => row.slice(0, want[r]?.length)) }).toEqual({ table, cells: want });
  }
});

// ── verify-RC-B4 R6-2: no column is hidden by its NAME ───────────────────────
// A column called "Action" is real content (a follow-up per row); hiding it by
// default is a screen that lies. Only the person hides a column.
it.each(["Action", "Actions", "**Action**"])("a column named %j is shown by default", async (name) => {
  const table = `| Bay | ${name} |\n| --- | --- |\n| B3 | Re-scan before 6am |`;
  const got = await renderedCells(table);
  expect(got[1]).toContain("Re-scan before 6am");
});

// ── verify-RC-B4 R6-3: an in-cell <br> renders as a line break ────────────────
it("a cell's <br> renders as a real line break", async () => {
  await renderedCells("| Bay | Note |\n| --- | --- |\n| B3 | Re-scan<br>before 6am |");
  const cell = container.querySelectorAll("tbody td")[1] as HTMLElement | undefined;
  expect(cell?.querySelector("br")).not.toBeNull();
  expect(cell?.textContent).not.toContain("<br>");
});
