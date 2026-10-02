/**
 * REGRESSION GUARD: the Agent Handoff stream decisions (pure core).
 *
 * Wire facts pinned here (verified against matrx-connect child_agent_context
 * + matrx-ai executor; contract: aidream docs/cx_chat/FE_HANDOFF_AGENT_PATTERNS.md):
 *
 * 1. A child agent's loop announces its OWN reservations on the PARENT's
 *    wire with parent_refs.conversation_id = the CHILD conversation — they
 *    must never enter the parent stream's turn bookkeeping (FIX 1).
 * 2. The handoff call is the OLDEST still-pending tool call at failure time;
 *    the specialist's inner tools stream undisguised and must not move the
 *    rewind anchor (FIX 2).
 * 3. `sub_agent failed` fires for EVERY raising child; only a child whose
 *    INIT was never observed (lifecycle-suppressed = handoff) may rewind
 *    (FIX 3).
 */

import {
  HandoffRewindTracker,
  decideAssistantReservation,
  reservationBelongsToConversation,
  type ReservedAssistantTurn,
} from "../handoff-stream-state";

const PARENT = "conv-parent";
const CHILD = "conv-child";

describe("reservationBelongsToConversation (FIX 1)", () => {
  it("accepts this conversation's reservations and legacy events without a wire id", () => {
    expect(reservationBelongsToConversation(PARENT, PARENT, false)).toBe(true);
    expect(reservationBelongsToConversation(undefined, PARENT, false)).toBe(true);
    expect(reservationBelongsToConversation(null, PARENT, false)).toBe(true);
  });

  it("rejects a child conversation's reservation announced on the parent wire", () => {
    expect(reservationBelongsToConversation(CHILD, PARENT, false)).toBe(false);
  });

  it("manual mode ignores wire ids by design (fresh conv_id per call)", () => {
    expect(reservationBelongsToConversation("wire-fresh", PARENT, true)).toBe(true);
  });
});

describe("decideAssistantReservation (FIX 1 — the rebind targets THIS conversation's turn)", () => {
  it("foreign (child-loop) assistant reservations never enter the turn list", () => {
    const turns: ReservedAssistantTurn[] = [{ messageId: "parent-loop-start", position: 2 }];
    const decision = decideAssistantReservation(turns, {
      recordId: "child-loop-start",
      position: 1,
      handoff: false,
      belongsToConversation: false,
    });
    expect(decision).toEqual({ kind: "foreign" });
    expect(turns).toEqual([{ messageId: "parent-loop-start", position: 2 }]);
  });

  it("handoff rebind re-keys the parent's placeholder even after a child reservation streamed", () => {
    const turns: ReservedAssistantTurn[] = [];

    // Parent loop-start reservation → tracked.
    expect(
      decideAssistantReservation(turns, {
        recordId: "parent-loop-start",
        position: 2,
        handoff: false,
        belongsToConversation: true,
      }),
    ).toEqual({ kind: "track" });
    turns.push({ messageId: "parent-loop-start", position: 2 });

    // Handoff child announces ITS loop-start on the same wire → foreign,
    // list untouched. (The pre-fix bug: this became the "last turn".)
    expect(
      decideAssistantReservation(turns, {
        recordId: "child-loop-start",
        position: 1,
        handoff: false,
        belongsToConversation: false,
      }),
    ).toEqual({ kind: "foreign" });

    // Handoff synthetic row for the PARENT conversation → rebind swaps the
    // parent placeholder, in place, no second turn.
    const rebind = decideAssistantReservation(turns, {
      recordId: "durable-synthetic-row",
      position: 5,
      handoff: true,
      belongsToConversation: true,
    });
    expect(rebind).toEqual({ kind: "rebind", oldMessageId: "parent-loop-start" });
    expect(turns).toEqual([{ messageId: "durable-synthetic-row", position: 5 }]);
  });

  it("a handoff announcement with no tracked turn falls back to tracking (never lost)", () => {
    const turns: ReservedAssistantTurn[] = [];
    expect(
      decideAssistantReservation(turns, {
        recordId: "durable-synthetic-row",
        position: 5,
        handoff: true,
        belongsToConversation: true,
      }),
    ).toEqual({ kind: "track" });
  });
});

describe("HandoffRewindTracker (FIX 2 + FIX 3)", () => {
  const snap = (n: number) => ({
    blockCount: n,
    reasoningChunkCount: n,
    timelineLength: n,
  });

  it("anchors the rewind to the HANDOFF call, not the specialist's inner tools (FIX 2)", () => {
    const t = new HandoffRewindTracker();

    // Caller's earlier ordinary tool — started and settled.
    t.onToolStarted("call-parent-tool", snap(1));
    t.onToolSettled("call-parent-tool");

    // The handoff call starts (pending for the child's whole run).
    t.onToolStarted("call-handoff", snap(4));

    // The specialist calls its own tools on the same wire.
    t.onToolStarted("call-child-inner-1", snap(9));
    t.onToolSettled("call-child-inner-1");
    t.onToolStarted("call-child-inner-2", snap(12)); // dies mid-tool, stays pending

    const decision = t.decideOnSubAgentFailure("op-handoff-child");
    expect(decision).toEqual({ action: "rewind", snapshot: snap(4) });
  });

  it("a retried tool_started for the same call_id keeps the ORIGINAL boundary", () => {
    const t = new HandoffRewindTracker();
    t.onToolStarted("call-handoff", snap(4));
    t.onToolStarted("call-handoff", snap(20));
    expect(t.decideOnSubAgentFailure("op-x")).toEqual({
      action: "rewind",
      snapshot: snap(4),
    });
  });

  it("never rewinds for a lifecycle-visible child (its sub_agent INIT was observed) (FIX 3)", () => {
    const t = new HandoffRewindTracker();
    t.onToolStarted("call-agent-call", snap(3));
    t.onSubAgentInit("op-inline-child");
    expect(t.decideOnSubAgentFailure("op-inline-child")).toEqual({
      action: "skip_non_handoff",
    });
  });

  it("a DIFFERENT visible child's init does not shield a handoff failure", () => {
    const t = new HandoffRewindTracker();
    t.onSubAgentInit("op-earlier-summarizer");
    t.onToolStarted("call-handoff", snap(7));
    expect(t.decideOnSubAgentFailure("op-handoff-child")).toEqual({
      action: "rewind",
      snapshot: snap(7),
    });
  });

  it("handoff-shaped failure with no tool boundary is loud-but-non-destructive (FIX 3)", () => {
    const t = new HandoffRewindTracker();
    expect(t.decideOnSubAgentFailure("op-x")).toEqual({ action: "no_boundary" });
  });
});
