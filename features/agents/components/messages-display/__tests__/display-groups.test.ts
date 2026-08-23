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

// ── The duplicate-bubble class ──────────────────────────────────────────────
// A live turn must render exactly ONCE. It used to render twice whenever the
// scan for "which record is streaming" hit a different assistant record first
// — the next turn's empty reserved row — and gave up, so the real record
// rendered as settled AND a synthetic __streaming__ entry rendered the same
// live text beside it. Reported from live voice testing, 2026-08-23.
describe("buildDisplayEntries — one bubble per live turn", () => {
  it("finds the streaming record even when a reserved assistant sits after it", () => {
    const entries = buildDisplayEntries({
      messages: [
        msg("u1", "user", 1),
        msg("a1", "assistant", 2, "req-live"),
        // The next turn's placeholder, created while req-live still streams.
        msg("a2", "assistant", 3, undefined, {
          status: "reserved",
          content: [],
        }),
      ],
      isActive: true,
      latestRequestId: "req-live",
      isErrorPhase: false,
    });

    // The real record carries the stream...
    const live = entries.filter((e) => e.isStreamActive);
    expect(live).toHaveLength(1);
    expect(live[0].messageId).toBe("a1");
    // ...and no synthetic duplicate was appended for the same request.
    expect(entries.some((e) => e.key.startsWith("__streaming__"))).toBe(false);
  });

  it("still synthesizes a stream entry when no record carries it yet", () => {
    const entries = buildDisplayEntries({
      messages: [msg("u1", "user", 1), msg("a1", "assistant", 2, "req-old")],
      isActive: true,
      latestRequestId: "req-new",
      isErrorPhase: false,
    });

    const live = entries.filter((e) => e.isStreamActive);
    expect(live).toHaveLength(1);
    expect(live[0].key).toBe("__streaming__:req-new");
    // The previous turn is a different turn — it still renders, settled.
    expect(entries.some((e) => e.messageId === "a1" && !e.isStreamActive)).toBe(
      true,
    );
  });
});
