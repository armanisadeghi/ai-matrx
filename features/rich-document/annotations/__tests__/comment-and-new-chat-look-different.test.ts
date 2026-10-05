/**
 * Comment (stays on this chat, rides the next message) and "New chat about this"
 * (leaves for /chat/new) sit side by side on the selection toolbar. Live walk
 * 2026-10-05: both were a speech bubble with a plus, and a Comment click was
 * taken for New chat. They must never share a look.
 */
import { COMMENT_ICON, NEW_CHAT_ICON } from "../annotation-actions";

it("the two icons are different components", () => {
  expect(NEW_CHAT_ICON).not.toBe(COMMENT_ICON);
});

it("New chat about this is not a message-bubble icon", () => {
  const name = (NEW_CHAT_ICON as unknown as { displayName?: string }).displayName ?? "";
  expect(name).not.toMatch(/^Message/);
});
