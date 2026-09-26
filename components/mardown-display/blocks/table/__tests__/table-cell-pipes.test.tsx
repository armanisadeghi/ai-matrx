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
