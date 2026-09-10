/**
 * THE ARCHIVED-ITEMS LAW on the DM conversation list — register row F5's tail.
 *
 * F5 shipped an INTERIM client-side split: the pane fetched everything and
 * partitioned `WAConversation.isArchived` itself. `@ai-matrx/messaging` 0.11.0
 * made the axis a SERVER request (`p_archived`, register row R1), so the split
 * is deleted and the rows the pane is handed are exactly the rows the filter
 * asked for.
 *
 * These assertions are written from the law, not from the implementation:
 *
 *   1. The pane renders every row it is given, and never partitions on
 *      `isArchived`. (RED against the interim split: an archived row was
 *      hidden inside a collapsed disclosure.)
 *   2. The reveal moves the SERVER filter. (RED against the interim split,
 *      which only flipped local `showArchived` state.)
 *   3. While the archive is showing, the way back is always on screen — even
 *      before the count lands.
 *   4. A capped count renders "N+", never a confident "N".
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConversationListPane } from "../ConversationListPane";
import type { WAConversation } from "../../types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function conversation(
  id: string,
  name: string,
  isArchived: boolean,
): WAConversation {
  return {
    id,
    name,
    avatarUrl: null,
    isGroup: false,
    participants: [],
    lastMessagePreview: "hi",
    lastMessageAt: "2026-09-10T00:00:00.000Z",
    lastMessageIsOwn: false,
    unreadCount: 0,
    isArchived,
    isMuted: false,
    online: false,
  } as WAConversation;
}

describe("DM conversation list — THE ARCHIVED-ITEMS LAW", () => {
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

  function render(node: React.ReactElement) {
    act(() => {
      root.render(node);
    });
  }

  function archiveButton(): HTMLButtonElement | null {
    return (
      Array.from(container.querySelectorAll("button")).find((b) =>
        (b.textContent ?? "").includes("Archived chats"),
      ) ?? null
    );
  }

  it("renders every row it is handed and partitions none of them", () => {
    // The server was asked for `all`, so BOTH rows are rows it sent.
    render(
      <ConversationListPane
        conversations={[
          conversation("a", "Active Ada", false),
          conversation("b", "Archived Abe", true),
        ]}
        selectedId={null}
        onSelect={() => undefined}
        archiveFilter="all"
        onArchiveFilterChange={() => undefined}
        archivedCount={{ count: 1, exact: true }}
      />,
    );

    expect(container.textContent).toContain("Active Ada");
    expect(container.textContent).toContain("Archived Abe");
  });

  it("hides the archive by default and reveals it with ONE click that moves the SERVER filter", () => {
    const moves: string[] = [];
    render(
      <ConversationListPane
        conversations={[conversation("a", "Active Ada", false)]}
        selectedId={null}
        onSelect={() => undefined}
        archiveFilter="active"
        onArchiveFilterChange={(next) => moves.push(next)}
        archivedCount={{ count: 4, exact: true }}
      />,
    );

    const button = archiveButton();
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("Archived chats (4)");
    expect(button?.getAttribute("aria-expanded")).toBe("false");

    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(moves).toEqual(["archived"]);
  });

  it("offers no reveal when there is nothing archived", () => {
    render(
      <ConversationListPane
        conversations={[conversation("a", "Active Ada", false)]}
        selectedId={null}
        onSelect={() => undefined}
        archiveFilter="active"
        onArchiveFilterChange={() => undefined}
        archivedCount={{ count: 0, exact: true }}
      />,
    );

    expect(archiveButton()).toBeNull();
  });

  it("keeps the way back on screen while the archive shows, even before the count lands", () => {
    const moves: string[] = [];
    render(
      <ConversationListPane
        conversations={[conversation("b", "Archived Abe", true)]}
        selectedId={null}
        onSelect={() => undefined}
        archiveFilter="archived"
        onArchiveFilterChange={(next) => moves.push(next)}
        archivedCount={null}
      />,
    );

    const button = archiveButton();
    expect(button).not.toBeNull();
    // No count has landed, so no number is promised.
    expect(button?.textContent).not.toContain("(");
    expect(button?.getAttribute("aria-expanded")).toBe("true");

    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(moves).toEqual(["active"]);
  });

  it("prints a capped count as N+, never a confident N", () => {
    render(
      <ConversationListPane
        conversations={[conversation("a", "Active Ada", false)]}
        selectedId={null}
        onSelect={() => undefined}
        archiveFilter="active"
        onArchiveFilterChange={() => undefined}
        archivedCount={{ count: 50, exact: false }}
      />,
    );

    expect(archiveButton()?.textContent).toContain("Archived chats (50+)");
  });
});
