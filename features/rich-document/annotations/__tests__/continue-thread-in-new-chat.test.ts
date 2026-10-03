/**
 * "Continue in new chat" reads the thread off the panel's item: the root
 * comment's id and words, every reply with who wrote it ("You", a person, the
 * agent), and the agent that replied last — the one the new chat goes to.
 * A comment that is not saved yet has no thread to continue.
 */
jest.mock("@ai-matrx/chat/agents/components/chat/new-chat-about", () => ({ openNewChatAbout: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { replyingAgentOf, threadOfItem } from "../ContinueInNewChatItem";
import type { AnnotationSource, ResolvedItem } from "../types";

const SOURCE: AnnotationSource = { token: "message", id: "answer-1", title: "Chat answer", body: "", contentVersion: 1, conversationId: "conv-intake" };
const AGENT = { id: "agent-intake", name: "Scrap Intake Advisor" };
const ITEM = {
  key: "comment:root-7",
  kind: "comment",
  saveState: "confirmed",
  anchor: { __kind: "text_anchor", exact: "Weigh every inbound load" },
  author: { id: "user-dana", name: "Dana Reyes" },
  mine: true,
  createdAt: "2026-10-03T10:00:00Z",
  body: "Truck scale or floor scale?",
  commentId: "root-7",
  resolution: null,
  replies: [
    { id: "r1", version: 1, body: "The truck scale.", author: { id: "user-dana", name: AGENT.name, agent: AGENT }, createdAt: "2026-10-03T10:01:00Z", mine: true },
    { id: "r2", version: 1, body: "Even for small loads?", author: { id: "user-dana", name: "Dana Reyes" }, createdAt: "2026-10-03T10:02:00Z", mine: true },
    { id: "r3", version: 1, body: "Yes — the floor scale drifts.", author: { id: "user-sam", name: "Sam Ortiz" }, createdAt: "2026-10-03T10:03:00Z", mine: false },
  ],
} as unknown as ResolvedItem;

it("reads the root, its passage and every reply with its author", () => {
  expect(threadOfItem(ITEM, SOURCE)).toEqual({
    rootCommentId: "root-7",
    messageId: "answer-1",
    conversationId: "conv-intake",
    quote: "Weigh every inbound load",
    body: "Truck scale or floor scale?",
    replies: [
      { author: "Scrap Intake Advisor", body: "The truck scale." },
      { author: "You", body: "Even for small loads?" },
      { author: "Sam Ortiz", body: "Yes — the floor scale drifts." },
    ],
  });
});

it("the agent that replied takes the new chat", () => {
  expect(replyingAgentOf(ITEM)).toBe("agent-intake");
  expect(replyingAgentOf({ ...ITEM, replies: [] } as ResolvedItem)).toBeNull();
});

it("an unsaved comment has no thread to continue; a non-message record names no answer", () => {
  expect(threadOfItem({ ...ITEM, saveState: "pending" } as ResolvedItem, SOURCE)).toBeNull();
  expect(threadOfItem(ITEM, { ...SOURCE, token: "note", id: "note-3", conversationId: undefined })?.messageId).toBeNull();
});
