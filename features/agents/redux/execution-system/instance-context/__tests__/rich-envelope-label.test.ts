/**
 * A context value in the server's RICH ENVELOPE form (`{content, type, label,
 * description, max_inline_chars}`) already says what it is. The entry must show
 * that label and type — before this, the composer's context rail showed the
 * bare key with a JSON icon for every envelope (send-to-agent, war room).
 */
import instanceContextReducer, {
  setContextEntries,
  setContextEntry,
} from "../instance-context.slice";

const conversationId = "c1";

it("setContextEntries takes label and type from a rich envelope", () => {
  const state = instanceContextReducer(
    undefined,
    setContextEntries({
      conversationId,
      entries: [
        {
          key: "user_tagged_context",
          value: { content: "hello", type: "text", label: "Important context from the user" },
        },
      ],
    }),
  );
  expect(state.byConversationId[conversationId].user_tagged_context).toMatchObject({
    type: "text",
    label: "Important context from the user",
  });
});

it("an explicit label/type still wins, and a plain object stays json keyed by its key", () => {
  let state = instanceContextReducer(
    undefined,
    setContextEntry({
      conversationId,
      key: "k",
      value: { content: "x", label: "From envelope" },
      label: "Explicit",
    }),
  );
  expect(state.byConversationId[conversationId].k.label).toBe("Explicit");
  expect(state.byConversationId[conversationId].k.type).toBe("text");
  state = instanceContextReducer(
    state,
    setContextEntry({ conversationId, key: "data", value: { a: 1 } }),
  );
  expect(state.byConversationId[conversationId].data).toMatchObject({ type: "json", label: "data" });
  // Not an envelope (a non-envelope key rides along) — plain JSON, like the server reads it.
  state = instanceContextReducer(
    state,
    setContextEntry({ conversationId, key: "post", value: { content: "x", author: "a", label: "L" } }),
  );
  expect(state.byConversationId[conversationId].post).toMatchObject({ type: "json", label: "post" });
});
