/**
 * THE ORACLE TAP'S IN-APP DOOR IS IN THE LIVE MESSAGE MENU — on both roles.
 *
 * Census row 11 (2026-09-12) reported the door missing: a real chat message's
 * ⋯ menu showed Edit/Fork/Delete, nine "Save as" formats and four Copy formats
 * and "no Rulebook option anywhere". Driven live on 2026-09-12 the item IS
 * there ("Add to Rulebook", Actions group) — the menu is a scrolling panel and
 * the observation stopped at the last row that fit on screen. So the finding
 * was a reading of a clipped list, not an absent feature.
 *
 * What that episode leaves behind is worth a guard anyway: the door lives in
 * ONE place, twenty-odd rows below the fold, where nobody would notice it
 * silently disappearing in a menu refactor — which is exactly how the
 * `features/cx-chat` copy of this menu ended up without it. Both assembled
 * menus are asserted here, on the real registry, not on a source string.
 */

import {
  getAssistantMessageActions,
  getUserMessageActions,
  type MessageActionContext,
} from "@/features/agents/components/messages-display/message-options/messageActionRegistry";

function ctx(): MessageActionContext {
  return {
    content: "Refund it anyway when the customer has been with us a year.",
    contentIsStructuredRaw: false,
    turnContent: null,
    isAuthenticated: true,
    messageId: "msg-77",
    editTarget: null,
    conversationId: "conv-1",
    metadata: null,
    dispatch: jest.fn(),
    getState: () => ({ messages: { byConversationId: {} } }),
    onClose: jest.fn(),
    showFullPrint: false,
    isCreator: false,
    streamRequestId: null,
    surfaceKey: null,
    contentHistoryCount: 0,
    isAdmin: false,
  } as unknown as MessageActionContext;
}

describe("the Oracle tap's message-menu door", () => {
  it("is offered on an assistant message", () => {
    const keys = getAssistantMessageActions(ctx()).map((i) => i.key);
    expect(keys).toContain("add-to-rulebook");
  });

  it("is offered on a user message too — a colleague's QUESTION is Rulebook material", () => {
    const keys = getUserMessageActions(ctx()).map((i) => i.key);
    expect(keys).toContain("add-to-rulebook");
  });

  it("opens the ONE shared picker overlay, never a second write path", () => {
    const dispatch = jest.fn();
    const item = getAssistantMessageActions({ ...ctx(), dispatch }).find(
      (i) => i.key === "add-to-rulebook",
    );
    expect(item).toBeDefined();
    item!.action?.();
    const payload = dispatch.mock.calls[0]?.[0]?.payload;
    expect(payload?.overlayId).toBe("addToRulebookDialog");
    // Provenance travels with the content — a draft in review must be able to
    // point back at the message it came from.
    expect(payload?.data?.initialMessageId).toBe("msg-77");
    expect(payload?.data?.initialConversationId).toBe("conv-1");
  });
});
