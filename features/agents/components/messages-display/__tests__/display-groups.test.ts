import {
  applyDisplayGroupWindow,
  buildDisplayEntries,
  groupDisplayEntries,
} from "../display-groups";
import type { MessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";

const CONV = "conv-test";

function msg(
  id: string,
  role: MessageRecord["role"],
  position: number,
  requestId?: string,
  patch?: Partial<MessageRecord>,
): MessageRecord {
  return {
    id,
    conversationId: CONV,
    agentId: null,
    role,
    content: [{ type: "text", content: id }],
    contentHistory: null,
    userContent: null,
    position,
    source: "test",
    status: "active",
    isVisibleToModel: true,
    isVisibleToUser: true,
    metadata: {},
    createdAt: `2026-07-14T00:00:${String(position).padStart(2, "0")}.000Z`,
    deletedAt: null,
    _clientStatus: "complete",
    ...(requestId ? { _streamRequestId: requestId } : {}),
    ...patch,
  };
}

function groups(messages: MessageRecord[], visibleLimit: number | null = null) {
  const entries = buildDisplayEntries({
    messages,
    isActive: false,
    latestRequestId: null,
    isErrorPhase: false,
  });
  return applyDisplayGroupWindow(groupDisplayEntries(entries), visibleLimit);
}

test("bottom window starts with the latest user and assistant groups", () => {
  const rendered = groups(
    [
      msg("u1", "user", 1),
      msg("a1", "assistant", 2),
      msg("u2", "user", 3),
      msg("a2", "assistant", 4),
    ],
    2,
  );

  expect(rendered.map((g) => g.key)).toEqual(["u2", "grp:a2"]);
});

test("consecutive users do not break bottom-first selection", () => {
  const rendered = groups(
    [
      msg("u1", "user", 1),
      msg("a1", "assistant", 2),
      msg("u2", "user", 3),
      msg("u3", "user", 4),
      msg("a2", "assistant", 5),
    ],
    2,
  );

  expect(rendered.map((g) => g.key)).toEqual(["u3", "grp:a2"]);
});

test("contiguous assistant iterations stay one assistant display group", () => {
  const rendered = groups(
    [
      msg("u1", "user", 1),
      msg("a1", "assistant", 2),
      msg("tool1", "tool", 3),
      msg("a2", "assistant", 4),
    ],
    2,
  );

  expect(rendered).toHaveLength(2);
  expect(rendered[1]).toMatchObject({ kind: "assistant", key: "grp:a1" });
  if (rendered[1].kind !== "assistant") {
    throw new Error("expected assistant group");
  }
  expect(rendered[1].members.map((m) => m.messageId)).toEqual(["a1", "a2"]);
});

test("failed assistant turns render standalone and remain windowable", () => {
  const rendered = groups(
    [
      msg("u1", "user", 1),
      msg("a1", "assistant", 2),
      msg("u2", "user", 3),
      msg("a2", "assistant", 4, undefined, {
        status: "failed",
        error: { type: "provider_error", message: "boom" },
      }),
    ],
    2,
  );

  expect(rendered.map((g) => g.kind)).toEqual(["user", "assistant-failed"]);
  expect(rendered[1]).toMatchObject({ key: "a2", canRetry: true });
});
