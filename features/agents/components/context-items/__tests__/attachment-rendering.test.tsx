import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ContextDrawerItem } from "../types";
import type { PreFetchedUrl } from "@/types/python-generated/stream-events";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const openAt = jest.fn();

jest.mock("@/features/agents/components/context-items/registry", () => ({
  resolveContextItemDef: (blockType: string) => ({
    typeLabel: blockType === "input_webpage" ? "Webpage" : "Attachment",
    icon: () => null,
    themeKey: blockType,
    editable: false,
  }),
}));

jest.mock("@/features/scraper/parts/ScrapedContentPretty", () => ({
  ScrapedContentPretty: ({ markdown }: { markdown: string }) => (
    <article data-testid="saved-webpage-text">{markdown}</article>
  ),
}));

jest.mock("@/components/ui/hover-card", () => ({
  HoverCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  HoverCardTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: React.ReactNode }) => (
    <aside data-testid="hover-content">{children}</aside>
  ),
}));

jest.mock("@/features/agents/components/previews/NoteHoverPreview", () => ({
  NotePreviewContent: ({ noteId }: { noteId: string }) => <span>{noteId}</span>,
}));

jest.mock("@/features/agents/components/previews/TaskHoverPreview", () => ({
  TaskPreviewContent: ({ taskId }: { taskId: string }) => <span>{taskId}</span>,
}));

jest.mock("@/features/agents/components/previews/DataRefHoverPreview", () => ({
  DataRefPreviewContent: () => <span>data preview</span>,
}));

jest.mock("@/features/agents/components/previews/WebpageHoverPreview", () => ({
  WebpagePreviewContent: ({
    url,
    title,
    snippet,
  }: {
    url: string;
    title?: string | null;
    snippet?: string | null;
  }) => (
    <div data-testid="webpage-hover-preview">
      <span>{title}</span>
      <span>{url}</span>
      <span>{snippet}</span>
    </div>
  ),
}));

jest.mock("@/features/agents/components/context-items/useContextItemDrawer", () => ({
  useContextItemDrawer: () => ({
    open: false,
    items: [],
    index: 0,
    activeItem: null,
    openAt,
    setOpen: jest.fn(),
    next: jest.fn(),
    prev: jest.fn(),
    goTo: jest.fn(),
  }),
}));

jest.mock("@/features/agents/components/context-items/ContextItemDrawer", () => ({
  ContextItemDrawer: () => null,
}));

jest.mock("@/features/files/components/preview/FileResourceChip", () => ({
  FileResourceChip: ({ fileId }: { fileId: string }) => <span>{fileId}</span>,
}));

jest.mock("../../messages-display/user/ResourceAttachmentTile", () => ({
  ResourceAttachmentTile: ({
    typeLabel,
    title,
    onClick,
  }: {
    typeLabel: string;
    title: string;
    onClick: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {typeLabel}: {title}
    </button>
  ),
}));

import { WebpageBody } from "../bodies/WebpageBody";
import { BlockHoverPreview } from "../../previews/BlockHoverPreview";
import { MessageAttachmentStrip } from "../../messages-display/MessageAttachmentStrip";

const snapshot: PreFetchedUrl = {
  url: "https://example.com/full-article",
  title: "Stored article title",
  textContent: "Stored article text — immutable after send.",
  charCount: 43,
  scrapedAt: "2026-08-11T20:57:26.175Z",
};

function webpageItem(origin: ContextDrawerItem["origin"]): ContextDrawerItem {
  return {
    id: `webpage-${origin}`,
    blockType: "input_webpage",
    typeLabel: "Webpage",
    title: snapshot.title ?? snapshot.url,
    icon: () => null,
    themeKey: "input_webpage",
    origin,
    conversationId: "conversation-1",
    editable: origin === "resource",
    refs: { webpages: [snapshot] },
    raw: snapshot,
    ...(origin === "resource" ? { resourceId: "resource-1" } : {}),
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  openAt.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("submitted webpage rendering", () => {
  it("displays the exact stored text and never embeds a mutable live webpage", () => {
    act(() => {
      root.render(<WebpageBody item={webpageItem("block")} />);
    });

    expect(container.textContent).toContain(snapshot.textContent);
    expect(container.textContent).toContain("Snapshot sent with this message");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("[contenteditable='true']")).toBeNull();
  });

  it("labels an attached draft without pretending it was already sent", () => {
    act(() => {
      root.render(<WebpageBody item={webpageItem("resource")} />);
    });

    expect(container.textContent).toContain("Snapshot attached to this draft");
    expect(container.textContent).not.toContain("Snapshot sent with this message");
    expect(container.textContent).toContain(snapshot.textContent);
  });

  it("renders a legacy string URL without fetching or embedding the live page", () => {
    const item = webpageItem("block");
    item.refs.webpages = ["https://legacy.example.com/article"];

    act(() => {
      root.render(<WebpageBody item={item} />);
    });

    expect(container.textContent).toContain("No saved text for this older attachment");
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("passes only webpage strings into the hover preview", () => {
    expect(() => {
      act(() => {
        root.render(
          <BlockHoverPreview item={webpageItem("block")}>
            <button type="button">Open snapshot</button>
          </BlockHoverPreview>,
        );
      });
    }).not.toThrow();

    const preview = container.querySelector("[data-testid='webpage-hover-preview']");
    expect(preview?.textContent).toContain(snapshot.title);
    expect(preview?.textContent).toContain(snapshot.url);
    expect(preview?.textContent).toContain(snapshot.textContent);
    expect(preview?.textContent).not.toContain("[object Object]");
  });

  it("renders a submitted webpage strip from the object snapshot without an object-as-child error", () => {
    expect(() => {
      act(() => {
        root.render(
          <MessageAttachmentStrip
            conversationId="conversation-1"
            parts={[{ type: "input_webpage", urls: [snapshot] }]}
          />,
        );
      });
    }).not.toThrow();

    expect(container.textContent).toContain(`Webpage: ${snapshot.title}`);
    expect(container.textContent).toContain(snapshot.url);
    expect(container.textContent).toContain(snapshot.textContent);
    expect(container.textContent).not.toContain("[object Object]");

    const tile = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(snapshot.title ?? ""),
    );
    expect(tile).toBeDefined();
    act(() => tile?.click());
    expect(openAt).toHaveBeenCalledTimes(1);
    expect(openAt.mock.calls[0]?.[0]?.[0]).toMatchObject({
      origin: "block",
      editable: false,
      refs: { webpages: [snapshot] },
    });
  });
});
