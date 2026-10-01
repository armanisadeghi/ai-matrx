/**
 * B1 — a KIND whose component crashed falls to its generic structured floor
 * (`StructuredValueView` with the kind), never a raw JSON code block. Kindless
 * blocks and a still-streaming buffer keep the code-block rung.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/official/structured-value/StructuredValueView", () => ({
  __esModule: true,
  default: ({ kind, note }: { kind?: string; note?: string }) => (
    <div data-route="floor" data-kind={kind} data-note={note} />
  ),
}));
jest.mock("@/features/code-editor/components/code-block/CodeBlock", () => ({
  __esModule: true,
  default: ({ code }: { code: string }) => <pre data-route="code">{code}</pre>,
}));

import { BlockFallback } from "./BlockFallback";
import type { RenderBlock } from "../block-registry/BlockRenderer";

const KIND = JSON.stringify({ __kind: "quiz", title: "Cells", questions: [] });

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

const render = async (block: Partial<RenderBlock>, isStreamActive = false) => {
  await act(async () => {
    root.render(
      <BlockFallback block={block as RenderBlock} isStreamActive={isStreamActive} />,
    );
  });
  // Let the lazy rung resolve.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe("BlockFallback", () => {
  it("draws a crashed kind on its structured floor, never as JSON", async () => {
    await render({ type: "quiz", content: KIND });
    const floor = container.querySelector('[data-route="floor"]');
    expect(floor?.getAttribute("data-kind")).toBe("quiz");
    expect(floor?.getAttribute("data-note")).toBe("its view hit an error");
    expect(container.querySelector('[data-route="code"]')).toBeNull();
    expect(container.textContent).not.toContain("__kind");
  });

  it("keeps the code rung for kindless JSON and for a streaming buffer", async () => {
    await render({ type: "code", language: "json", content: '{"name":"Ada"}' });
    expect(container.querySelector('[data-route="code"]')?.textContent).toContain("Ada");
    await render({ type: "quiz", content: KIND }, true);
    expect(container.querySelector('[data-route="floor"]')).toBeNull();
  });
});
