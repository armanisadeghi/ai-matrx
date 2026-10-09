/**
 * B2 — an unregistered data event whose payload carries `__kind` is drawn as
 * its kind through `AnswerValueView`, never the catch-all card's JSON <pre>;
 * a kindless payload keeps the catch-all card exactly as before.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/content-ir/studio/components/KindInstanceRender", () => ({
  __esModule: true,
  default: ({ kind }: { kind: string }) => <div data-kind-route={kind} />,
}));
jest.mock("@ai-matrx/chat/ui/markdown-stream/MarkdownStream", () => ({
  __esModule: true,
  default: () => <div data-route="markdown" />,
}));
jest.mock("@ai-matrx/media/react", () => ({ InlineMediaRef: () => null }));
const mockCaptureError = jest.fn();
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: (input: unknown) => mockCaptureError(input),
}));
// The kind-at-raw-renderer report goes through the chat package's diagnostics seam; both sinks
// share one mock so no capture escapes the assertions.
jest.mock("@ai-matrx/chat/host/diagnostics", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/diagnostics"),
  captureError: (input: unknown) => mockCaptureError(input),
}));

import UnknownDataEventBlock from "../UnknownDataEventBlock";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mockCaptureError.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("UnknownDataEventBlock", () => {
  it("draws a kind payload as its kind, never the JSON dump", async () => {
    await act(async () =>
      root.render(
        <UnknownDataEventBlock
          dataType="study_pack"
          data={{ __kind: "flashcard_set", title: "Cells", cards: [] }}
        />,
      ),
    );
    // The kind renderer sits behind the one lazy front door.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[data-kind-route="flashcard_set"]')).not.toBeNull();
    expect(container.querySelector("pre")).toBeNull();
    expect(container.textContent).not.toContain("__kind");
    expect(
      mockCaptureError.mock.calls.some(([i]) =>
        (i as { message: string }).message.startsWith("UnknownDataEventBlock"),
      ),
    ).toBe(true);
  });

  it("keeps the catch-all card for a kindless payload", () => {
    act(() =>
      root.render(<UnknownDataEventBlock dataType="mystery" data={{ name: "Ada" }} />),
    );
    expect(container.querySelector("[data-kind-route]")).toBeNull();
    expect(container.querySelector("pre")?.textContent).toContain('"name"');
  });
});
