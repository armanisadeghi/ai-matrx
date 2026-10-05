import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../registry", () => ({
  resolveContextItemDef: () => ({
    typeLabel: "Webpage",
    icon: () => null,
    themeKey: "input_webpage",
    editable: false,
  }),
  resolveContextItemBody: () => function MockBody() {
    return <div data-testid="drawer-body">Saved webpage body</div>;
  },
  resolveContextItemFooter: () => null,
  resolveContextItemTitle: () => null,
  resolveContextItemTitleActions: () => null,
}));

const toggle = jest.fn();
jest.mock("../../../../host/canvas", () => ({
  useChatCanvasTab: () => ({ isAvailable: true, isVisible: false, selected: null, toggle }),
}));

jest.mock("../../../../store/hooks", () => ({
  useAppDispatch: () => jest.fn(),
}));
// The host code this test renders reads the app's own hooks (P3): one double covers both.




jest.mock("@host/features/agents/components/previews/WebpageHoverPreview", () => ({
  WebpagePreviewContent: () => <div>Saved webpage preview</div>,
}));







import { MessageAttachmentStrip } from "../../messages-display/MessageAttachmentStrip";
import { ContextItemViewer } from "../ContextItemViewer";
import { readContextItemsTab } from "../contextItemsTab";
import type { CanvasJson } from "@ai-matrx/canvas";

describe("attachment chip interaction", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  it("a submitted webpage chip opens its item in the strip's canvas tab, and the tab's data renders it", () => {
    toggle.mockClear();
    act(() => {
      root.render(
        <MessageAttachmentStrip
          conversationId="conversation-1"
          parts={[
            {
              type: "input_webpage",
              urls: [
                {
                  url: "https://example.com/article",
                  title: "Stored article",
                  textContent: "Stored article body",
                  charCount: 19,
                  scrapedAt: "2026-08-11T20:57:26.175Z",
                },
              ],
            },
          ]}
        />,
      );
    });

    const chip = container.querySelector<HTMLButtonElement>(
      "button[title='Stored article']",
    );
    expect(chip).not.toBeNull();

    const hoverTrigger = chip?.parentElement?.parentElement;
    expect(hoverTrigger?.tagName).toBe("DIV");
    expect(hoverTrigger?.getAttribute("data-state")).toBe("closed");

    act(() => {
      hoverTrigger?.dispatchEvent(
        new MouseEvent("pointerover", { bubbles: true }),
      );
      jest.advanceTimersByTime(300);
    });

    expect(document.body.textContent).toContain("Saved webpage preview");

    act(() => chip?.click());

    // No panel of its own: the press goes to the canvas tab, with the list as JSON.
    expect(container.querySelector("[data-context-item-viewer]")).toBeNull();
    expect(toggle).toHaveBeenCalledTimes(1);
    const open = toggle.mock.calls[0]?.[0] as {
      title: string;
      data: { items: CanvasJson };
      selected: string;
      replaceData: boolean;
    };
    expect(open.title).toBe("Stored article");
    expect(open.replaceData).toBe(true);

    const tab = readContextItemsTab({ items: open.data.items, selected: open.selected });
    expect(tab.items).toHaveLength(1);
    expect(tab.items[0]?.id).toBe(open.selected);
    act(() => {
      root.render(<ContextItemViewer items={tab.items} index={0} onIndexChange={() => undefined} />);
    });
    expect(container.textContent).toContain("Saved webpage body");
  });
});
