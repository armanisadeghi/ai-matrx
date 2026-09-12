/**
 * GUARD (defect D6) — the message ⋯ menu must FIT.
 *
 * The Actions group, with "Add to Rulebook" in it, once sat roughly twenty
 * rows below the last visible item: a reader auditing the menu concluded the
 * door did not exist, and a real user would too. A 600px desktop panel on a
 * 768px-tall viewport shows about seventeen 32px rows, so:
 *
 *   - every primary door is inside the first `MAX_VISIBLE_ROWS` rows, and
 *   - no group is stranded: the whole top level is at most that tall, with
 *     every remaining family behind a VISIBLE submenu trigger.
 *
 * This renders the REAL registry through the REAL menu primitive — not a
 * hand-made item list.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";

import AdvancedMenu from "@/components/official/AdvancedMenu";
import {
  getAssistantMessageActions,
  getUserMessageActions,
  type MessageActionContext,
} from "../messageActionRegistry";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

/** 768px viewport → 600px panel → ~17 rows of 32px, minus the header. */
const MAX_VISIBLE_ROWS = 17;

const CONVERSATION_ID = "conv-1";
const MESSAGE_ID = "msg-2";

function makeContext(): MessageActionContext {
  const state = {
    conversations: {
      byConversationId: {
        [CONVERSATION_ID]: { title: "A thread", agentId: "agent-1" },
      },
    },
    messages: {
      byConversationId: {
        [CONVERSATION_ID]: {
          byId: {
            "msg-1": { role: "user", content: "How do refunds work?", position: 1 },
            [MESSAGE_ID]: { role: "assistant", content: "Here is the answer.", position: 2 },
          },
          order: ["msg-1", MESSAGE_ID],
        },
      },
    },
  } as unknown as ReturnType<MessageActionContext["getState"]>;

  return {
    content: "Here is the answer.",
    turnContent: "Here is the answer.",
    isAuthenticated: true,
    messageId: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    metadata: null,
    dispatch: jest.fn() as unknown as MessageActionContext["dispatch"],
    getState: () => state,
    onClose: jest.fn(),
    showFullPrint: true,
    onFullPrint: jest.fn(),
    isCreator: true,
    streamRequestId: null,
    surfaceKey: null,
    onRequestDelete: jest.fn(),
    onRequestEditHistory: jest.fn(),
    contentHistoryCount: 1,
    onRequestConvert: jest.fn(),
    isAdmin: true,
    openMessageTemplateSave: jest.fn(() => ({ close: jest.fn() })),
    spokenSummaryAgent: { agentId: "agent-2", label: "Spoken summary" },
  };
}

async function renderMenu(items: ReturnType<typeof getAssistantMessageActions>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <AdvancedMenu
        isOpen
        onClose={jest.fn()}
        showBackdrop={false}
        position="center"
        items={items}
        title="Message options"
      />,
    );
  });
  return {
    root,
    container,
    rows: () =>
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")),
    cleanup: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("message ⋯ menu fits a 768px-tall viewport (D6)", () => {
  it("puts Add to Rulebook in the visible region of the assistant menu", async () => {
    const menu = await renderMenu(getAssistantMessageActions(makeContext()));
    const labels = menu.rows().map((row) => row.textContent ?? "");

    const index = labels.findIndex((label) => /Add to Rulebook/i.test(label));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(MAX_VISIBLE_ROWS);
    expect(labels.length).toBeLessThanOrEqual(MAX_VISIBLE_ROWS);

    await menu.cleanup();
  });

  it("keeps the user menu inside the visible region too", async () => {
    const menu = await renderMenu(getUserMessageActions(makeContext()));
    const labels = menu.rows().map((row) => row.textContent ?? "");

    expect(labels.length).toBeLessThanOrEqual(MAX_VISIBLE_ROWS);
    expect(labels.some((label) => /Add to Rulebook/i.test(label))).toBe(true);

    await menu.cleanup();
  });

  it("keeps every Save as format reachable behind a visible submenu trigger", async () => {
    const menu = await renderMenu(getAssistantMessageActions(makeContext()));

    const trigger = menu
      .rows()
      .find(
        (row) =>
          row.getAttribute("data-submenu-trigger") === "true" &&
          /Save as/i.test(row.textContent ?? ""),
      );
    expect(trigger).toBeTruthy();

    await act(async () => {
      trigger!.click();
    });

    const labels = menu.rows().map((row) => row.textContent ?? "");
    expect(labels.some((label) => /PDF Document/i.test(label))).toBe(true);
    expect(labels.some((label) => /Markdown/i.test(label))).toBe(true);
    // The way back out is on screen.
    expect(labels.some((label) => /^Save as$/i.test(label.trim()))).toBe(true);

    await menu.cleanup();
  });
});
