/**
 * THE ORACLE TAP'S IN-APP DOOR IS IN THE LIVE MESSAGE MENU — on both roles.
 *
 * Census row 11 (2026-09-12) reported the door missing: the menu is a
 * scrolling panel and the observation stopped at the last row that fit. The
 * door lives in ONE place — since RC-B6 the ONE rich-document action registry
 * the chat bars render — and this asserts it on the real registry, through the
 * real chat menu builder, not on a source string.
 */

import "@/features/rich-document/actions/handlers";
import { resolveActions } from "@/features/rich-document/actions/provider";
import { toAdvancedMenuItems } from "@/features/rich-document/variants/RegistryActionMenu";
import { chatContext } from "@/features/rich-document/test-utils/chatContext";

function menuKeys(role: "assistant" | "user"): string[] {
  const ctx = chatContext(role);
  return toAdvancedMenuItems(resolveActions(ctx), ctx, () => ctx).map(
    (i) => i.key,
  );
}

describe("the Oracle tap's message-menu door", () => {
  it("is offered at the top level of an assistant message's menu", () => {
    expect(menuKeys("assistant")).toContain("add-to-rulebook");
  });

  it("is offered on a user message too — a colleague's QUESTION is Rulebook material", () => {
    expect(menuKeys("user")).toContain("add-to-rulebook");
  });

  it("opens the ONE shared picker overlay, never a second write path", async () => {
    const dispatch = jest.fn();
    const ctx = chatContext("assistant", { dispatch });
    const item = toAdvancedMenuItems(resolveActions(ctx), ctx, () => ctx).find(
      (i) => i.key === "add-to-rulebook",
    );
    expect(item).toBeDefined();
    item!.action?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const payload = dispatch.mock.calls[0]?.[0]?.payload;
    expect(payload?.overlayId).toBe("addToRulebookDialog");
    // Provenance travels with the content — a draft in review must be able to
    // point back at the message it came from.
    expect(payload?.data?.initialMessageId).toBe("msg-2");
    expect(payload?.data?.initialConversationId).toBe("conv-1");
  });
});
