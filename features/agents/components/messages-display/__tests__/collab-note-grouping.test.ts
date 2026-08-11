/**
 * Pins the DELIVERED collaboration note's display routing.
 *
 * The turn-boundary inbox drain persists an `agent_call` `remember=true`
 * write-back as a USER-role cx_message. Rendering it as a plain user bubble
 * tells the user they said something they never said — so it must group as
 * its own `collab-note` kind, while every genuine user message is untouched.
 */

import {
  buildDisplayEntries,
  groupDisplayEntries,
  isCollabNoteRecord,
} from "../display-groups";
import type { MessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";

function msg(over: Partial<MessageRecord>): MessageRecord {
  return {
    id: "m1",
    conversationId: "c1",
    agentId: null,
    role: "user",
    content: [{ type: "text", text: "hello" }],
    contentHistory: null,
    userContent: null,
    position: 1,
    source: "chat",
    status: "active",
    isVisibleToModel: true,
    isVisibleToUser: true,
    metadata: {},
    createdAt: "2026-08-11T00:00:00Z",
    deletedAt: null,
    ...over,
  } as MessageRecord;
}

const NOTE_TEXT =
  "[Collaboration note] Agent 'Reviewer' reviewed this conversation via agent_call and left this durable note:\nWatch the pricing section.";

test("a genuine user message is NOT a collaboration note", () => {
  expect(isCollabNoteRecord(msg({}))).toBe(false);
});

test("the server's canonical note prefix is detected", () => {
  expect(
    isCollabNoteRecord(
      msg({ content: [{ type: "text", text: NOTE_TEXT }] }),
    ),
  ).toBe(true);
});

test("provenance metadata is detected even without the prefix", () => {
  expect(
    isCollabNoteRecord(
      msg({
        content: [{ type: "text", text: "some note body" }],
        metadata: { agent_collab: { agent_id: "a1", call_id: "c1" } },
      }),
    ),
  ).toBe(true);
});

test("an assistant message is never a collaboration note", () => {
  expect(
    isCollabNoteRecord(
      msg({ role: "assistant", content: [{ type: "text", text: NOTE_TEXT }] }),
    ),
  ).toBe(false);
});

test("a delivered note groups as collab-note; the real user turn stays a user bubble", () => {
  const groups = groupDisplayEntries(
    buildDisplayEntries({
      messages: [
        msg({ id: "u1", content: [{ type: "text", text: "What changed?" }] }),
        msg({ id: "n1", content: [{ type: "text", text: NOTE_TEXT }] }),
      ],
      isActive: false,
      latestRequestId: null,
      isErrorPhase: false,
    }),
  );

  expect(groups.map((g) => g.kind)).toEqual(["user", "collab-note"]);
  expect(groups[0]).toMatchObject({ kind: "user", messageId: "u1" });
  expect(groups[1]).toMatchObject({ kind: "collab-note", messageId: "n1" });
});
