/**
 * Guards the responsive split contract: Redux can remember a desktop split,
 * but a phone renders one pane, so its header must behave as a single-pane
 * history view rather than hiding the only way to reach the other item.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  canvasSlice,
  offerCanvasItem,
  openCanvas,
  selectCanvasItems,
  splitCanvasWith,
  type CanvasContent,
} from "@/features/canvas/redux/canvasSlice";
import { CanvasNavigation } from "../CanvasNavigation";
import { CanvasPane } from "../CanvasPane";

const mockUseIsMobile = jest.fn(() => false);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => () => null,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/components/ui/scroll-fade", () => ({
  useScrollFade: () => ({ ref: jest.fn(), style: {} }),
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  ...jest.requireActual("@/lib/redux/selectors/userSelectors"),
  selectIsAdmin: () => false,
}));

jest.mock("../CanvasBody", () => ({
  ...jest.requireActual("../CanvasBody"),
  CanvasBody: () => <div>Canvas body</div>,
}));

jest.mock("../CanvasSourceView", () => ({
  CanvasSourceView: () => <div>Canvas source</div>,
}));

jest.mock("../CanvasPaneHeaderChrome", () => ({
  CanvasPaneUserMenu: () => null,
}));

jest.mock("../CanvasHeaderToggle", () => ({
  CanvasPanePutAwayToggle: () => null,
}));

jest.mock("@/features/canvas/components/CanvasArtifactDebugPanel", () => ({
  CanvasArtifactDebugPanel: () => null,
}));

const CONTENT: CanvasContent = {
  type: "sandbox",
  data: { sandboxRowId: "box-1" },
  metadata: {
    title: <span>First item</span>,
    sourceMessageId: "sandbox:box-1",
  },
};

function makeStore() {
  return configureStore({
    reducer: { canvas: canvasSlice.reducer },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

function mount(store: ReturnType<typeof makeStore>, node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <Provider store={store}>
        <TooltipProvider>{node}</TooltipProvider>
      </Provider>,
    );
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function splitStore() {
  const store = makeStore();
  act(() => {
    store.dispatch(openCanvas(CONTENT));
    store.dispatch(
      offerCanvasItem({
        ...CONTENT,
        data: { sandboxRowId: "box-2" },
        metadata: { title: "Second item", sourceMessageId: "sandbox:box-2" },
      }),
    );
    const [, second] = selectCanvasItems(store.getState());
    store.dispatch(splitCanvasWith(second.id));
  });
  return store;
}

describe("CanvasPane with remembered split state", () => {
  it.each([
    ["mobile", true, true, false],
    ["desktop", false, false, true],
  ])(
    "shows the correct switcher and split action on %s",
    (_viewport, isMobile, expectsSwitcher, expectsSplit) => {
      mockUseIsMobile.mockReturnValue(isMobile);
      const { container, unmount } = mount(
        splitStore(),
        <CanvasPane paneRole="single" />,
      );

      expect(container.querySelector("[data-canvas-switcher]")).toEqual(
        expectsSwitcher ? expect.any(HTMLElement) : null,
      );
      expect(container.querySelector('[aria-label="Split canvas"]')).toEqual(
        expectsSplit ? expect.any(HTMLElement) : null,
      );

      unmount();
    },
  );
});

describe("CanvasNavigation accessible controls", () => {
  it("names each icon control, including removal from the history list", () => {
    const store = splitStore();
    const items = selectCanvasItems(store.getState());
    const { container, unmount } = mount(
      store,
      <CanvasNavigation
        items={items}
        currentItemId={items[0].id}
        onNavigate={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(
      container.querySelector('[aria-label="Previous canvas"]'),
    ).not.toBeNull();
    const list = container.querySelector<HTMLButtonElement>(
      '[aria-label="View all canvas items"]',
    );
    expect(list).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Next canvas"]'),
    ).not.toBeNull();

    // A LIVE pane (both fixture items are the sandbox) offers no Remove: its
    // surface re-offers it for as long as the box is running, so the control
    // would visibly lose its own fight. Absent, never dead — see
    // features/canvas/liveSourceReachability.ts.
    expect(
      container.querySelector('[aria-label="Remove First item"]'),
    ).toBeNull();

    unmount();
  });

  it("still names the removal control for a stored item", () => {
    const store = splitStore();
    act(() => {
      store.dispatch(
        offerCanvasItem({
          type: "code",
          data: { code: "print(1)", language: "python" },
          metadata: { title: "A saved snippet", sourceMessageId: "code-1" },
        } as CanvasContent),
      );
    });
    const items = selectCanvasItems(store.getState());
    const { container, unmount } = mount(
      store,
      <CanvasNavigation
        items={items}
        currentItemId={items[0].id}
        onNavigate={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(
      container.querySelector('[aria-label="Remove A saved snippet"]'),
    ).not.toBeNull();
    unmount();
  });
});
