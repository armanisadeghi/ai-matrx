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
