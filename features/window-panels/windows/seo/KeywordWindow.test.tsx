import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import KeywordWindow from "./KeywordWindow";

jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: ({
    children,
    sidebar,
  }: {
    children: React.ReactNode;
    sidebar: React.ReactNode;
  }) => (
    <div>
      <aside>{sidebar}</aside>
      <main>{children}</main>
    </div>
  ),
}));

jest.mock("@/features/marketing/seo/keyword/KeywordIntelPanel", () => ({
  KeywordIntelPanel: ({ phrase }: { phrase: string }) => (
    <div data-testid="dossier-phrase">{phrase}</div>
  ),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("KeywordWindow external opens", () => {
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

  it("adds and selects a new phrase when the singleton window is already open", async () => {
    await act(async () => {
      root.render(
        <KeywordWindow
          isOpen
          onClose={() => undefined}
          initialPhrase="first keyword"
        />,
      );
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="dossier-phrase"]')?.textContent,
    ).toBe("first keyword");

    await act(async () => {
      root.render(
        <KeywordWindow
          isOpen
          onClose={() => undefined}
          initialPhrase="second keyword"
        />,
      );
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="dossier-phrase"]')?.textContent,
    ).toBe("second keyword");
    expect(container.textContent).toContain("first keyword");
    expect(container.textContent).toContain("second keyword");
  });
});
