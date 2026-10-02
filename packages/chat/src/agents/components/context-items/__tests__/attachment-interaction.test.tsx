import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/agents/components/context-items/registry", () => ({
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

jest.mock("@/components/matrx/resizable/MatrxDynamicPanelHost", () => ({
  MatrxDynamicPanelHost: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => open ? <section data-testid="attachment-drawer">{children}</section> : null,
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
}));

jest.mock("@/features/files/components/preview/FileResourceChip", () => ({
  FileResourceChip: () => null,
}));

jest.mock("@/features/agents/components/previews/WebpageHoverPreview", () => ({
  WebpagePreviewContent: () => <div>Saved webpage preview</div>,
}));

jest.mock("@/features/agents/components/previews/NoteHoverPreview", () => ({
  NotePreviewContent: () => null,
}));

jest.mock("@/features/agents/components/previews/TaskHoverPreview", () => ({
  TaskPreviewContent: () => null,
}));

jest.mock("@/features/agents/components/previews/DataRefHoverPreview", () => ({
  DataRefPreviewContent: () => null,
}));

import { MessageAttachmentStrip } from "../../messages-display/MessageAttachmentStrip";

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

  it("opens the shared immutable drawer from a submitted webpage chip", () => {
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

    expect(container.querySelector("[data-testid='attachment-drawer']")).toBeNull();

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

    expect(
      container.querySelector("[data-testid='attachment-drawer']"),
    ).not.toBeNull();
    expect(container.textContent).toContain("Saved webpage body");
  });
});
