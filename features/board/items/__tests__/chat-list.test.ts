/**
 * The chat tile's conversation list: open/closed is the person's saved choice
 * (else it follows the tile's width), the choice survives every source save,
 * and the board's conversations are exactly the `conversation → board` edges.
 */
import {
  CHAT_LIST_WIDE_PX,
  chatListChoice,
  chatListOpen,
  chatSource,
  chatSourceToSave,
  withChatList,
} from "../work-sources";
import { chatIdsFromEdges, withChat, withoutChat } from "../board-chats.logic";

const ID = "7d1c2a9e-4b0f-4c1e-9a55-2f3e8b6d1a01";
const OTHER = "7d1c2a9e-4b0f-4c1e-9a55-2f3e8b6d1a02";
const AGENT = "11111111-2222-4333-8444-555555555555";

describe("chat tile list state", () => {
  it("follows the width when the person has not chosen", () => {
    const s = chatSource(null, null);
    expect(chatListChoice(s)).toBeNull();
    expect(chatListOpen(s, CHAT_LIST_WIDE_PX)).toBe(true);
    expect(chatListOpen(s, CHAT_LIST_WIDE_PX - 1)).toBe(false);
  });

  it("the saved choice wins over the width, both ways", () => {
    expect(chatListOpen(withChatList(chatSource(ID, null), "closed"), 900)).toBe(false);
    expect(chatListOpen(withChatList(chatSource(ID, null), "open"), 300)).toBe(true);
  });

  it("collapse is remembered on the saved tile (keeps id and agent)", () => {
    const next = withChatList(chatSource(ID, AGENT), "closed");
    expect(next).toEqual({ kind: "entity", entity: "chat", id: ID, meta: { agentId: AGENT, list: "closed" } });
  });

  it("switching conversation or starting a new one keeps the choice", () => {
    const base = { serverHasIt: true, agentId: AGENT, chosenAgentId: AGENT, list: "closed" as const };
    expect(chatSourceToSave({ ...base, conversationId: OTHER, savedId: ID })?.meta).toEqual({ agentId: AGENT, list: "closed" });
    // New conversation: unsent, the old id is forgotten, the choice stays.
    expect(chatSourceToSave({ ...base, serverHasIt: false, conversationId: OTHER, savedId: ID })).toEqual({
      kind: "entity",
      entity: "chat",
      id: null,
      meta: { agentId: AGENT, list: "closed" },
    });
  });

  it("an unsent conversation is never saved by id when switching", () => {
    const saved = chatSourceToSave({
      conversationId: OTHER,
      serverHasIt: false,
      savedId: ID,
      agentId: null,
      chosenAgentId: null,
      list: "open",
    });
    expect(saved?.id).toBeNull();
  });
});

describe("the board's conversations", () => {
  it("are the conversation edges, once each", () => {
    const edges = [
      { sourceType: "conversation", sourceId: ID },
      { sourceType: "note", sourceId: "n1" },
      { sourceType: "conversation", sourceId: ID },
      { sourceType: "conversation", sourceId: OTHER },
    ];
    expect(chatIdsFromEdges(edges)).toEqual([ID, OTHER]);
  });

  it("file and unfile are idempotent", () => {
    const a = withChat([ID], ID);
    expect(a).toEqual([ID]);
    expect(withChat([ID], OTHER)).toEqual([ID, OTHER]);
    expect(withoutChat([ID, OTHER], ID)).toEqual([OTHER]);
    expect(withoutChat([OTHER], ID)).toEqual([OTHER]);
  });
});
