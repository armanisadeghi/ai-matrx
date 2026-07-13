/**
 * handoff-stream-state — the PURE decision core for the Agent Handoff stream
 * contract (Pattern 1). process-stream.ts is the thin shell that feeds it
 * events and dispatches what it decides; every rule here is unit-testable
 * without mocking the stream pipeline.
 *
 * Contract of record: aidream docs/cx_chat/FE_HANDOFF_AGENT_PATTERNS.md +
 * services/agent_handoff/FEATURE.md. Three wire facts this module encodes
 * (verified against matrx-connect child_agent_context + matrx-ai executor):
 *
 * 1. **Child loops announce on the parent's wire.** A child agent's own
 *    loop-start reservations stream to the parent's client with
 *    `parent_refs.conversation_id` = the CHILD conversation. Only
 *    reservations whose conversation matches THIS stream's conversation may
 *    enter the turn bookkeeping — otherwise a handoff child's placeholder
 *    hijacks the rebind and the commit splits content across conversations.
 *
 * 2. **The handoff call is identifiable only structurally.** Projected agent
 *    tools stream opaque tool names, so the FE anchors the pre-handoff
 *    content snapshot to the OLDEST still-pending tool call at failure time:
 *    the handoff `cx_tool_call` stays pending for the child's whole run (its
 *    tool_error is emitted only AFTER the failed sub_agent completion), while
 *    the specialist's inner tools start later. Batch policy guarantees one
 *    handoff per response.
 *
 * 3. **`sub_agent failed` is NOT handoff-specific** — child_agent_context
 *    emits it for EVERY raising child (inline agent_call, summarizers,
 *    reference-mode children). The discriminator: a NON-handoff child emits a
 *    `sub_agent` INIT with the same operation_id (emit_lifecycle=True); a
 *    handoff child suppresses INIT (emit_lifecycle=False). A failed
 *    completion with no matching observed INIT is a handoff failure → rewind.
 */

// ---------------------------------------------------------------------------
// Reservation scoping (wire fact 1)
// ---------------------------------------------------------------------------

/**
 * True when a `record_reserved` belongs to THIS stream's conversation.
 * Manual mode (`forceLocalConversationId`) deliberately ignores wire ids —
 * the wire conv id is minted fresh per call and never matches by design.
 * A missing wire conv id is treated as local (legacy events).
 */
export function reservationBelongsToConversation(
  wireConversationId: string | null | undefined,
  streamConversationId: string,
  forceLocalConversationId: boolean,
): boolean {
  if (forceLocalConversationId) return true;
  if (!wireConversationId) return true;
  return wireConversationId === streamConversationId;
}

// ---------------------------------------------------------------------------
// Assistant-turn bookkeeping (rebind)
// ---------------------------------------------------------------------------

export interface ReservedAssistantTurn {
  messageId: string;
  position: number;
}

export type AssistantReservationDecision =
  /** Reservation is another conversation's (a child loop) — do not touch
   * the messages slice or the turn list for this stream. */
  | { kind: "foreign" }
  /** Normal loop-start reservation — reserve + track as a new turn. */
  | { kind: "track" }
  /** Handoff synthetic row — promote the tracked turn's id to the durable
   * row id and update the turn in place (never push a second turn). */
  | { kind: "rebind"; oldMessageId: string };

/**
 * Decide what an assistant `record_reserved cx_message` means for the turn
 * list. MUTATES `turns` for the rebind case (updates the last tracked turn
 * in place); the caller pushes for the "track" case after its own
 * reserveMessage dispatch.
 */
export function decideAssistantReservation(
  turns: ReservedAssistantTurn[],
  args: {
    recordId: string;
    position: number;
    handoff: boolean;
    belongsToConversation: boolean;
  },
): AssistantReservationDecision {
  if (!args.belongsToConversation) return { kind: "foreign" };
  if (args.handoff && turns.length > 0) {
    const prior = turns[turns.length - 1];
    const oldMessageId = prior.messageId;
    prior.messageId = args.recordId;
    prior.position = args.position;
    return { kind: "rebind", oldMessageId };
  }
  return { kind: "track" };
}

// ---------------------------------------------------------------------------
// Rewind tracking (wire facts 2 + 3)
// ---------------------------------------------------------------------------

export interface ContentSnapshot {
  /** renderBlockOrder.length at the boundary. */
  blockCount: number;
  /** reasoningChunks.length at the boundary. */
  reasoningChunkCount: number;
  /** timeline.length at the boundary. */
  timelineLength: number;
}

export type RewindDecision =
  /** Handoff failure with a known boundary — rewind to this snapshot. */
  | { action: "rewind"; snapshot: ContentSnapshot }
  /** A NON-handoff child failed (its sub_agent INIT was observed) — the
   * orchestrator handles it as a normal error tool_result; never rewind. */
  | { action: "skip_non_handoff" }
  /** Handoff failure but no tool boundary was observed — contract
   * violation; keep content (loud, non-destructive). */
  | { action: "no_boundary" };

/**
 * Tracks exactly what the rewind decision needs: pending tool calls with
 * their pre-call content snapshots (insertion-ordered) and the operation ids
 * of observed `sub_agent` INITs.
 */
export class HandoffRewindTracker {
  /** call_id → snapshot, in tool_started order (Map preserves insertion). */
  private pending = new Map<string, ContentSnapshot>();
  private subAgentInitIds = new Set<string>();

  /** Every tool_started records the pre-call content boundary. */
  onToolStarted(callId: string, snapshot: ContentSnapshot): void {
    // Re-started call_id (retry): keep the ORIGINAL boundary — content
    // streamed between attempts belongs to the same call.
    if (!this.pending.has(callId)) this.pending.set(callId, snapshot);
  }

  /** tool_completed / tool_error settle the call — it can no longer anchor. */
  onToolSettled(callId: string): void {
    this.pending.delete(callId);
  }

  /** An `init {operation:"sub_agent"}` marks a NON-handoff child. */
  onSubAgentInit(operationId: string): void {
    this.subAgentInitIds.add(operationId);
  }

  /** Decide on a `completion {operation:"sub_agent", status:"failed"}`. */
  decideOnSubAgentFailure(operationId: string): RewindDecision {
    if (this.subAgentInitIds.has(operationId)) {
      return { action: "skip_non_handoff" };
    }
    // Oldest pending call = the handoff call (wire fact 2).
    const first = this.pending.entries().next();
    if (first.done) return { action: "no_boundary" };
    return { action: "rewind", snapshot: first.value[1] };
  }
}
