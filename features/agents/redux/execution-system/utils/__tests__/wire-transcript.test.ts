import {
  recordsToMessages,
  selectWireTranscript,
} from "../wire-transcript";
import type { MessageRecord } from "../../messages/messages.slice";

/**
 * Ephemeral runs write no rows, so turn 2+ replays the transcript as
 * `prior_messages` on /ai/agents/{id}. Manual mode replays the same shape as
 * `messages[]` on /ai/manual. One builder serves both — these pin its contract.
 */

const record = (over: Partial<MessageRecord>): MessageRecord =>
  ({
    id: "m1",
    role: "user",
    status: "active",
    content: [],
    ...over,
  }) as unknown as MessageRecord;

const text = (value: string) => [{ type: "text", text: value }];

describe("wire transcript", () => {
  test("passes structured content blocks through untouched", () => {
    const out = recordsToMessages([
      record({ role: "user", content: text("hello") as never }),
    ]);
    expect(out).toEqual([{ role: "user", content: text("hello") }]);
  });

  test("falls back to one text block when a record carries no block array", () => {
    // An optimistic user bubble that hasn't been promoted to a cx_message yet.
    const out = recordsToMessages([
      record({ role: "user", content: "hello" as never }),
    ]);
    expect(out).toEqual([{ role: "user", content: [{ type: "text", text: "" }] }]);
  });

  test("keeps role order and drops system messages", () => {
    const state = {
      messages: {
        byConversationId: {
          c1: {
            orderedIds: ["s1", "u1", "a1"],
            byId: {
              s1: record({
                id: "s1",
                role: "system",
                content: text("you are a bot") as never,
              }),
              u1: record({ id: "u1", role: "user", content: text("hi") as never }),
              a1: record({
                id: "a1",
                role: "assistant",
                content: text("hello") as never,
              }),
            },
          },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    // The server owns the system prompt on every path — never replay it.
    expect(selectWireTranscript(state, "c1").map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  test("an unknown conversation yields an empty transcript, not a throw", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = { messages: { byConversationId: {} } } as any;
    expect(selectWireTranscript(state, "nope")).toEqual([]);
  });
});
