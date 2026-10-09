/**
 * GeneratedImageSetBlock — a set of two or more images renders in the
 * canonical carousel viewer; one image keeps its single tile. Images are drawn
 * through the (mocked) canonical `<InlineMediaRef>`.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/media/react", () => ({
  InlineMediaRef: (props: Record<string, unknown>) => (
    <div data-testid="inline-media" data-alt={String(props.alt)} />
  ),
}));
jest.mock("@/features/overlays/openers/filePreviewWindow", () => ({
  useOpenFilePreviewWindow: () => jest.fn(),
}));
jest.mock("@/features/overlays/openers/imageViewer", () => ({
  useOpenImageViewerWindow: () => jest.fn(),
}));
jest.mock("@/components/cost/useCostDisplay", () => ({
  useCostDisplay: () => ({ unit: "usd", rate: 1 }),
}));

import GeneratedImageSetBlock from "./GeneratedImageSetBlock";

function image(n: number) {
  return {
    file_id: `0000000${n}-1a4c-4c31-8ad7-9d5a2b0f1e77`,
    url: `https://example.test/${n}.png`,
    cdn_url: `https://example.test/${n}.png`,
    width: 1024,
    height: 1024,
    seed: n,
  };
}

describe("GeneratedImageSetBlock", () => {
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

  const render = (count: number) =>
    act(() => {
      root.render(
        <GeneratedImageSetBlock
          hideHeader
          serverData={{
            images: Array.from({ length: count }, (_, i) => image(i + 1)),
            count,
            model: "image-model",
            usage: null,
            isComplete: true,
          }}
        />,
      );
    });

  it("shows several images as slides of one carousel with a counter", () => {
    render(3);
    expect(container.innerHTML).toContain("data-matrx-carousel");
    expect(container.querySelector('[data-matrx-carousel="viewer"]')).not.toBeNull();
    expect(container.querySelectorAll('[aria-roledescription="slide"]')).toHaveLength(3);
    expect(container.querySelector("[data-matrx-carousel-counter]")?.textContent).toBe("1 / 3");
  });

  it("keeps a single image as its tile, not a carousel", () => {
    render(1);
    expect(container.querySelector("[data-matrx-carousel]")).toBeNull();
    expect(container.querySelectorAll('[data-testid="inline-media"]')).toHaveLength(1);
  });
});
