import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const unpin = jest.fn();

jest.mock("@/components/favorites/usePinned", () => ({
  usePinned: () => ({
    favorites: [
      {
        id: "pdf-extractor",
        href: "/pdf-extractor",
        label: "PDF Extractor",
        color: "orange",
      },
    ],
    unpin,
  }),
}));

jest.mock("@/hooks/use-is-mounted", () => ({
  useIsMounted: () => true,
}));

jest.mock("@/features/shell/components/ShellIcon", () => ({
  __esModule: true,
  default: () => <span data-testid="shell-icon" />,
}));

import { PinnedSection } from "./PinnedSection";

describe("PinnedSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it("keeps the unpin icon inset and hidden until hover or keyboard focus", async () => {
    await act(async () =>
      root.render(
        <TooltipProvider>
          <PinnedSection />
        </TooltipProvider>,
      ),
    );

    const button = container.querySelector<HTMLButtonElement>(
      '[aria-label="Unpin PDF Extractor"]',
    );
    const reveal = button?.parentElement;

    expect(button).not.toBeNull();
    for (const className of [
      "absolute",
      "right-1",
      "top-1/2",
      "-translate-y-1/2",
      "opacity-100",
      "[@media(hover:hover)]:opacity-0",
      "[@media(hover:hover)]:group-hover:opacity-100",
      "[@media(hover:hover)]:focus-within:opacity-100",
    ]) {
      expect(reveal?.classList.contains(className)).toBe(true);
    }
    expect(button?.classList.contains("matrx-tap-target")).toBe(true);
  });
});
