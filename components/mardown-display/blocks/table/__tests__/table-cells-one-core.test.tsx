/**
 * Every table cell renders through the ONE markdown core (verify-RC-B7 r2).
 *
 * The break this guards: table cells rendered through a second, regex inline
 * renderer (InlineMarkdownWithLinks). The core's stream heal and math never
 * reached them, so a streaming table flashed raw `[Route 7](https://…`,
 * `` `R-7 ``, `**12 st` and `$c_{7`, and `$c_{1}$` never rendered as math
 * even when the table was complete.
 *
 * Seam: the REAL StreamingTableRenderer over real markdown, fed every prefix
 * (29-char steps) of a 60-row dispatch table, with the real MarkdownCore
 * (next/dynamic resolved to the real module) — only redux/toast/overlay
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
import { RichContent } from "@/components/rich-content/RichContent";

// A hauling dispatcher's route sheet: each row links the route page, names
// its code, bolds the stop count and gives the route's cost coefficient.
const ROWS = 60;
const TABLE = [
  "| Route | Page | Code | Stops | Cost factor |",
  "| --- | --- | --- | --- | --- |",
  ...Array.from({ length: ROWS }, (_, i) => {
    const n = i + 1;
    return `| ${n} | [Route ${n}](https://dispatch.greenroutehauling.com/routes/${n}) | \`R-${n}\` | **${8 + (n % 9)} stops** | $c_{${n}}$ |`;
  }),
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

async function renderTable(content: string, streaming: boolean) {
  await act(async () => {
    root.render(
      <MarkdownStreamingProvider value={streaming}>
        <StreamingTableRenderer content={content} isStreamActive={streaming} />
      </MarkdownStreamingProvider>,
    );
  });
}

/** Cell text a reader sees, with rendered code and math removed. */
function visibleCellText(): string {
  const cells = Array.from(container.querySelectorAll("td, th"));
  return cells
    .map((cell) => {
      const clone = cell.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("code, .katex").forEach((el) => el.remove());
      return clone.textContent ?? "";
    })
    .join(" | ");
}

const RAW = ["](", "**", "`", "[", "$"];

it("streams a 60-row table with no raw markdown in any cell", async () => {
  const flashes: string[] = [];
  for (let end = 29; end < TABLE.length; end += 29) {
    await renderTable(TABLE.slice(0, end), true);
    const text = visibleCellText();
    for (const raw of RAW) {
      if (text.includes(raw)) {
        const at = text.lastIndexOf(raw);
        flashes.push(`@${end} ${raw} «${text.slice(Math.max(0, at - 30), at + 20)}»`);
      }
    }
    if (flashes.length > 6) break;
  }
  expect(flashes).toEqual([]);
}, 600_000);

it("renders the finished table's math, links and code through the core", async () => {
  await renderTable(TABLE, false);
  const rows = container.querySelectorAll("tbody tr");
  expect(rows).toHaveLength(ROWS);
  expect(container.querySelectorAll("td .katex")).toHaveLength(ROWS);
  const hrefs = Array.from(container.querySelectorAll("td a")).map((a) =>
    (a.getAttribute("href") ?? "").replace(/[?&]utm_source=aimatrx$/, ""),
  );
  expect(hrefs[0]).toBe("https://dispatch.greenroutehauling.com/routes/1");
  expect(hrefs[ROWS - 1]).toBe(`https://dispatch.greenroutehauling.com/routes/${ROWS}`);
  expect(container.querySelectorAll("td code")).toHaveLength(ROWS);
  expect(visibleCellText()).not.toMatch(/\]\(|\*\*|`|\$/);
});

// ── Any cadence, any path (verify-RC-B7 r3) ──────────────────────────────────
// The studio replay splits text statically, so the table block carries no
// "streaming" status of its own — only the live stream around it knows. The
// last cell of a row cut mid-cell (`[terms 1](htt`, `**-`, a lone backtick)
// showed raw. These stream CHARACTER BY CHARACTER with the table's own
// isStreamActive false and only the surrounding live stream saying so.

async function renderInLiveStream(content: string) {
  await act(async () => {
    root.render(
      <MarkdownStreamingProvider value={true}>
        <StreamingTableRenderer content={content} isStreamActive={false} />
      </MarkdownStreamingProvider>,
    );
  });
}

async function streamCharByChar(text: string): Promise<string[]> {
  const flashes: string[] = [];
  for (let end = 1; end < text.length; end += 1) {
    await renderInLiveStream(text.slice(0, end));
    const visible = visibleCellText();
    for (const raw of RAW) {
      if (visible.includes(raw)) {
        const at = visible.lastIndexOf(raw);
        flashes.push(`@${end} ${raw} «${visible.slice(Math.max(0, at - 30), at + 20)}»`);
      }
    }
    if (flashes.length > 6) break;
  }
  return flashes;
}

// The verifier's shape: a terms column with links, bold and code per row.
const TERMS_TABLE = [
  "| # | Term | Rule | Code |",
  "| --- | --- | --- | --- |",
  ...Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return `| ${n} | [terms ${n}](https://greenroutehauling.com/terms/${n}) | **-${n}% late fee** | \`FEE-${n}\` |`;
  }),
].join("\n");

// The 15K admin sample's table section (captured 2026-09-25).
const SAMPLE_TABLE = [
  "| Command | Description |",
  "| --- | --- |",
  "| `git status` | List all *new or modified* files |",
  "| `git diff` | Show file differences that **haven't been** staged |",
].join("\n");

it("never shows raw markdown in the cut-off last cell, character by character (terms table)", async () => {
  expect(await streamCharByChar(TERMS_TABLE)).toEqual([]);
}, 900_000);

it("never shows raw markdown in the cut-off last cell, character by character (15K sample table)", async () => {
  expect(await streamCharByChar(SAMPLE_TABLE)).toEqual([]);
}, 900_000);

it("a finished table outside any stream is never healed", async () => {
  // A literal trailing `[A]` grade in a finished last cell stays as written.
  const graded = "| Route | Grade |\n| --- | --- |\n| 14 | [A] |";
  await act(async () => {
    root.render(<StreamingTableRenderer content={graded} isStreamActive={false} />);
  });
  expect(visibleCellText()).toContain("[A]");
});

it("the standard level (studio / nested content) never shows raw markdown in a cut-off cell", async () => {
  const flashes: string[] = [];
  for (let end = 1; end < TERMS_TABLE.length; end += 1) {
    await act(async () => {
      root.render(<RichContent level="standard" source={TERMS_TABLE.slice(0, end)} isStreaming />);
    });
    const visible = visibleCellText();
    for (const raw of RAW) {
      if (visible.includes(raw)) flashes.push(`@${end} ${raw} «${visible.slice(-50)}»`);
    }
    if (flashes.length > 6) break;
  }
  expect(flashes).toEqual([]);
  await act(async () => {
    root.render(<RichContent level="standard" source={TERMS_TABLE} isStreaming={false} />);
  });
  expect(container.querySelectorAll("td a")).toHaveLength(12);
}, 900_000);

