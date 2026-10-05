/**
 * Guard: an UNSENT Chat window never names its conversation in the address.
 *
 * Live 2026-10-05: /notes -> right-click -> Chat, send nothing, reload -> the
 * restored window wore "Couldn't load this conversation, so this list is empty
 * because the read failed". The window wrote its fresh launcher conversation id
 * as `c-<id>`; the hydrator reads an addressed id back with
 * `expectMaterialized: true`, and a never-sent conversation has no server row.
 */
import {
  addressableConversationId,
  AGENT_RUN_WINDOW_CONVERSATION_ARG,
} from "../agentRunWindowAddress";

describe("addressableConversationId", () => {
  it("leaves out a fresh conversation nothing was sent in", () => {
    expect(
      addressableConversationId({
        selectedConversationId: null,
        liveConversationId: "fresh-id",
        liveConversationHasMessages: false,
      }),
    ).toBeNull();
  });

  it("names the live conversation once it has a turn", () => {
    expect(
      addressableConversationId({
        selectedConversationId: null,
        liveConversationId: "sent-id",
        liveConversationHasMessages: true,
      }),
    ).toBe("sent-id");
  });

  it("always names a conversation the person opened from history", () => {
    expect(
      addressableConversationId({
        selectedConversationId: "opened-id",
        liveConversationId: "fresh-id",
        liveConversationHasMessages: false,
      }),
    ).toBe("opened-id");
  });

  it("keeps the arg key stable", () => {
    expect(AGENT_RUN_WINDOW_CONVERSATION_ARG).toBe("c");
  });
});
