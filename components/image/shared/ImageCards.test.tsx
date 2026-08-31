import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DesktopImageCard } from "./DesktopImageCard";
import { MobileImageCard } from "./MobileImageCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/design-system", () => ({
  Skeleton: () => <div data-image-skeleton="true" />,
}));

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
    expect(container.querySelector("[data-image-skeleton]")).not.toBeNull();

    act(() => {
      container.querySelector("img")?.dispatchEvent(new Event("load"));
    });
    expect(container.querySelector("[data-image-skeleton]")).toBeNull();
  });

  it("renders an honest unavailable state when no image URL exists", () => {
    act(() => {
      root.render(<ImageCard photo={{ id: "image-1" }} onClick={jest.fn()} />);
    });

    expect(container.textContent).toContain(unavailableText);
    expect(container.querySelector("img")).toBeNull();
  });
});
