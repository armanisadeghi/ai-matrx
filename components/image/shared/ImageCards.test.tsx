import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DesktopImageCard } from "./DesktopImageCard";
import { MobileImageCard } from "./MobileImageCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 🚨 THE DESIGN SYSTEM IS NOT STUBBED. It used to be — `jest.mock(
 * "@ai-matrx/design-system", () => ({ Skeleton }))` replaced the ENTIRE package
 * with one export, and once `components/ui/card` became a thin host binding
 * over the package's `Card`/`CardContent` (C-series card swap), that mock made
 * both of them `undefined` and every case here died with "Element type is
 * invalid … Check the render method of `Card`". The real package renders fine
 * under jsdom, so the cards are exercised for real and the loading state is
 * found by the Skeleton's own `data-slot="skeleton"` marker.
 */

jest.mock("./SelectableImageCard", () => ({
  SelectableImageCard: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe.each([
  ["desktop", DesktopImageCard, "Image not available"],
  ["mobile", MobileImageCard, "Not available"],
] as const)("%s image card", (_name, ImageCard, unavailableText) => {
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

  it("does not retain a failed URL state when the card receives a new image", () => {
    act(() => {
      root.render(
        <ImageCard
          photo={{ id: "image-1", url: "https://example.com/broken.jpg" }}
          onClick={jest.fn()}
        />,
      );
    });

    act(() => {
      container.querySelector("img")?.dispatchEvent(new Event("error"));
    });
    expect(container.textContent).toContain(unavailableText);

    act(() => {
      root.render(
        <ImageCard
          photo={{ id: "image-2", url: "https://example.com/working.jpg" }}
          onClick={jest.fn()}
        />,
      );
    });

    expect(container.textContent).not.toContain(unavailableText);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/working.jpg",
    );
    expect(container.querySelector("[data-slot='skeleton']")).not.toBeNull();

    act(() => {
      container.querySelector("img")?.dispatchEvent(new Event("load"));
    });
    expect(container.querySelector("[data-slot='skeleton']")).toBeNull();
  });

  it("renders an honest unavailable state when no image URL exists", () => {
    act(() => {
      root.render(<ImageCard photo={{ id: "image-1" }} onClick={jest.fn()} />);
    });

    expect(container.textContent).toContain(unavailableText);
    expect(container.querySelector("img")).toBeNull();
  });
});
