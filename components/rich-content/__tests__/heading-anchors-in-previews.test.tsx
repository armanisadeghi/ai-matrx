/**
 * FORCING FUNCTION: a preview never offers a link to a section that is not
 * on screen.
 *
 * The break this catches (RC-B2 re-verification, 2026-09-25): the extended
 * syntax adds a hover "#" anchor after every heading. Inside a collapsed
 * preview (the research AnalysisCard's two-line clamp, a card face, a list
 * row) the heading's section is not there, so the anchor is a dead link — and
 * its "#" read as part of the title. The inline level never emits anchors;
 * the standard level takes `headingAnchors={false}` for preview contexts.
 *
 * Use case: a research analyst's collapsed analysis card and a dispatcher's
 * route summary preview.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: (loader: () => Promise<unknown>) => {
    const source = String(loader);
    if (source.includes("MarkdownCoreImpl"))
      return jest.requireActual("@/components/markdown-core/MarkdownCoreImpl").default;
    if (source.includes("RichContentStandardImpl"))
      return jest.requireActual("@/components/rich-content/RichContentStandardImpl").default;
    return function Unloaded() {
      return null;
    };
  },
}));
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({
  InlineCopyButton: () => null,
}));

import { RichContent } from "@/components/rich-content/RichContent";

const ANALYSIS = "## Market sizing\n\nThe **regional** recycling market grew 6% in 2025.";

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

async function render(node: React.ReactElement) {
  await act(async () => {
    root.render(node);
  });
}

const anchors = () => container.querySelectorAll("[data-heading-anchor], a[href^='#']");

describe("heading anchors only where the section is on screen", () => {
  it("the standard level (a full document) keeps its section anchors", async () => {
    await render(<RichContent level="standard" source={ANALYSIS} />);
    expect(anchors().length).toBe(1);
  });

  it("the inline level (collapsed preview, card face) never emits one", async () => {
    await render(<RichContent level="inline" source={ANALYSIS} />);
    expect(container.textContent).toContain("Market sizing");
    expect(anchors().length).toBe(0);
    expect(container.textContent).not.toContain("#");
  });

  it("links-as-text inline previews drop it too", async () => {
    await render(<RichContent level="inline" links="text" source={ANALYSIS} />);
    expect(container.textContent).not.toContain("#");
  });

  it("a standard-level preview context turns them off", async () => {
    await render(<RichContent level="standard" headingAnchors={false} source={ANALYSIS} />);
    expect(container.textContent).toContain("Market sizing");
    expect(anchors().length).toBe(0);
  });
});
