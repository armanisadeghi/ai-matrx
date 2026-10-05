/**
 * C4 — the plain code block never draws settled kind JSON. A json / jsonc /
 * json5 / unlabelled block whose content is kind JSON renders through the one
 * value door (`KindDataGate` → `AnswerValueView` → `KindInstanceRender`) and
 * files its caller; a deliberate source view (`showSource`), a streaming
 * buffer, another language, and kindless JSON keep the code.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => undefined,
}));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@ai-matrx/kit/media-query", () => ({ ...jest.requireActual("@ai-matrx/kit/media-query"), useIsMobile: () => false }));
jest.mock("@/styles/themes/useThemeMode", () => ({ useThemeMode: () => "dark" }));
jest.mock("@/features/canvas/hooks/useCanvas", () => ({ useCanvas: () => ({ open: jest.fn() }) }));
jest.mock("@/features/overlays/openers/smartCodeEditorWindow", () => ({
  useOpenSmartCodeEditorWindow: () => jest.fn(),
}));
jest.mock("../SmallCodeEditor", () => ({ __esModule: true, default: () => null }));
jest.mock("../CodeBlockHeader", () => ({ __esModule: true, default: () => null }));
jest.mock("../StickyButtons", () => ({ __esModule: true, default: () => null }));
jest.mock("@/features/html-pages/services/htmlPageService", () => ({ HTMLPageService: {} }));
// jsdom has no IntersectionObserver; CodeBlock's sticky buttons observe its
// edges. An inert, fully typed stand-in (never reports an intersection).
class InertIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds: ReadonlyArray<number> = [0];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
globalThis.IntersectionObserver = InertIntersectionObserver;

// When set, the stand-in kind component falls back to a code block of its
// own value — the loop a kind's JSON fallback would cause.
const mockLoop = { value: null as string | null };
jest.mock("@/features/content-ir/studio/components/KindInstanceRender", () => ({
  __esModule: true,
  default: ({ kind }: { kind: string }) => {
    const { default: Block } = jest.requireActual("../CodeBlock") as typeof import("../CodeBlock");
    return (
      <div data-kind-route={kind}>
        {mockLoop.value ? <Block code={mockLoop.value} language="json" /> : null}
      </div>
    );
  },
}));
const mockCaptureError = jest.fn();
// The kind-at-raw-renderer report goes through the chat package's diagnostics seam.
jest.mock("@ai-matrx/chat/host/diagnostics", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/diagnostics"),
  captureError: (input: unknown) => mockCaptureError(input),
}));

import CodeBlock from "../CodeBlock";
import { resetKindAtRawRendererReports } from "@/features/content-ir/surfaces/report-kind-at-raw-renderer";

const KIND = JSON.stringify({ __kind: "timeline", title: "History", events: [] }, null, 2);
const KINDLESS = JSON.stringify({ name: "Ada Lovelace" }, null, 2);

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mockLoop.value = null;
  mockCaptureError.mockClear();
  resetKindAtRawRendererReports();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Render, then let the kind front door's lazy edge resolve. */
const render = async (node: React.ReactElement) => {
  await act(async () => root.render(node));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const routes = () =>
  [...container.querySelectorAll("[data-kind-route]")].map((n) => n.getAttribute("data-kind-route"));

describe("CodeBlock never draws settled kind JSON", () => {
  it.each(["json", "JSON", "jsonc", "json5", ""])("language %j: kind JSON renders as its kind", async (language) => {
    await render(<CodeBlock code={KIND} language={language} />);
    expect(routes()).toEqual(["timeline"]);
    expect(container.textContent).not.toContain("__kind");
    expect(
      mockCaptureError.mock.calls.some(([i]) => (i as { message: string }).message.startsWith("CodeBlock")),
    ).toBe(true);
  });

  it.each([
    ["showSource", { showSource: true }],
    ["a streaming buffer", { isStreamActive: true }],
  ])("%s keeps the code", async (_label, extra) => {
    await render(<CodeBlock code={KIND} language="json" {...extra} />);
    expect(routes()).toEqual([]);
    expect(container.textContent).toContain("__kind");
  });

  it("another language keeps the code", async () => {
    await render(<CodeBlock code={KIND} language="typescript" />);
    expect(routes()).toEqual([]);
  });

  it("kindless JSON stays JSON", async () => {
    await render(<CodeBlock code={KINDLESS} language="json" />);
    expect(routes()).toEqual([]);
    expect(container.textContent).toContain("Ada Lovelace");
  });

  it("a kind whose own view falls back to a code block of the same value does not loop", async () => {
    mockLoop.value = KIND;
    await render(<CodeBlock code={KIND} language="json" />);
    expect(routes()).toEqual(["timeline"]);
    expect(container.textContent).toContain("__kind"); // the inner fallback shows source once
  });
});
