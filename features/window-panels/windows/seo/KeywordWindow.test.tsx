import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import overlayReducer from "@/lib/redux/slices/overlaySlice";
import { ReactQueryProvider } from "@/providers/ReactQueryProvider";
import KeywordWindow from "./KeywordWindow";

/**
 * The window's own providers, in the same shape the sibling window suites use
 * (`features/window-panels/__tests__/agentRunWindowOpener.test.tsx`): the real
 * `ReactQueryProvider` the app mounts, over a minimal store carrying only the
 * slices this tree dispatches into. Rendering the window bare made it throw
 * inside `useKeywordAssignSurfaces` / `useOpenKeywordWindow` rather than testing
 * anything about phrase selection.
 */
function Harness({ children }: { children: React.ReactNode }) {
  const [store] = React.useState(() =>
    configureStore({ reducer: { overlays: overlayReducer } }),
  );
  return (
    <Provider store={store}>
      <ReactQueryProvider>{children}</ReactQueryProvider>
    </Provider>
  );
}

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
  let matchMediaDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    // jsdom ships no matchMedia; `useIsMobile` inside the canonical context menu
    // reads it during render. Same stub the sibling suites use
    // (features/admin/users/components/AccountsTableClient.test.tsx).
    matchMediaDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "matchMedia",
    );
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    if (matchMediaDescriptor) {
      Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });

  it("adds and selects a new phrase when the singleton window is already open", async () => {
    await act(async () => {
      root.render(
        <Harness>
          <KeywordWindow
            isOpen
            onClose={() => undefined}
            initialPhrase="first keyword"
          />
        </Harness>,
      );
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="dossier-phrase"]')?.textContent,
    ).toBe("first keyword");

    await act(async () => {
      root.render(
        <Harness>
          <KeywordWindow
            isOpen
            onClose={() => undefined}
            initialPhrase="second keyword"
          />
        </Harness>,
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
