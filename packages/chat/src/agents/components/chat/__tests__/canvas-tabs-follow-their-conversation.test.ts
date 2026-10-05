/**
 * A canvas tab about one chat must not carry into another chat.
 *
 * Use case: the founder of a dental clinic commented on the reminder plan's
 * answer, the thread opened in the canvas, then she chose "New chat about this"
 * — the new chat showed the old chat's thread beside it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CanvasItem } from "@ai-matrx/canvas";
import { canvasItemConversation, tabsOfOtherConversations } from "../useCanvasScopedToConversation";

const item = (id: string, data: unknown) => ({ id, data }) as unknown as CanvasItem;
const messageIn = (map: Record<string, string>) => (messageId: string) => map[messageId] ?? null;

describe("canvas tabs follow their conversation", () => {
  const items = {
    thread: item("thread", { entity: "message", id: "m-old", title: "Chat answer" }),
    docs: item("docs", { conversationId: "conv-old" }),
    stamped: item("stamped", { entity: "message", id: "m-unloaded", conversationId: "conv-old" }),
    task: item("task", { entity: "task", id: "t-1", title: "Comments" }),
    here: item("here", { entity: "message", id: "m-new" }),
    unknown: item("unknown", { entity: "message", id: "m-never-loaded" }),
  };
  const lookup = messageIn({ "m-old": "conv-old", "m-new": "conv-new" });

  it("closes tabs known to belong to another chat, keeps everything else", () => {
    expect(tabsOfOtherConversations(items, "conv-new", lookup).sort()).toEqual(["docs", "stamped", "thread"]);
  });

  it("keeps the tabs of the chat on screen", () => {
    expect(tabsOfOtherConversations(items, "conv-old", lookup).sort()).toEqual(["here"]);
  });

  it("never judges a tab whose chat it cannot know", () => {
    expect(canvasItemConversation(items.unknown, lookup)).toBeNull();
    expect(canvasItemConversation(items.task, lookup)).toBeNull();
  });

  it("is wired: the chat surface applies it and a message thread is stamped with its chat", () => {
    const surface = readFileSync(join(__dirname, "../ChatConversationSurface.tsx"), "utf8");
    expect(surface).toContain("useCanvasScopedToConversation(conversationId)");
    const reply = readFileSync(
      join(__dirname, "../../../../../../../features/matrx-envelope/directives/commentReply/CommentReplyRenderer.tsx"),
      "utf8",
    );
    expect(reply).toContain('conversationId: thread.entity === "message" ? conversationId : null');
  });
});
