/**
 * What a CHILD agent streamed on this request's wire — computed ONCE for both
 * timeline walkers (`selectUnifiedSlots`, live; `assembleMessageParts`, the
 * committed record).
 *
 * An `agent_call` child (and any deeper descendant) streams its tokens, its
 * own tool calls and its thinking on the PARENT's stream with no per-event
 * attribution. None of it persists to the parent conversation — it lives in
 * the child's. So anything the transcript shows from it live vanishes on
 * reload (PB-01 S14, 2026-10-01: "Agent Call · 2 calls" and a "Thought
 * process" card became one bare card after F5).
 *
 * The only anchor is the `sub_agent` operation bound to its owning agent_call
 * (`toolCallId`, D209): its block range, timeline range and reasoning-chunk
 * range. An op with no owner hides nothing — the hide is a handoff to that
 * card, and an ownerless range (a server-orchestrated adopted run) would
 * render nowhere.
 */

import type {
  CompletedOperationEntry,
  OperationEntry,
  TimelineEntry,
} from "../../../types/request.types";

export interface ChildOwnedRanges {
  /** Render blocks streamed inside an owned range. */
  blockIds: Set<string>;
  /** Tool calls whose FIRST event landed inside an owned range (never the owner itself). */
  callIds: Set<string>;
  /** True when a reasoning run starting at this chunk index belongs to a child. */
  isChildReasoning: (chunkStartIndex: number) => boolean;
}

export interface ChildOwnedRangesInput {
  timeline: readonly TimelineEntry[] | undefined;
  renderBlockOrder: readonly string[] | undefined;
  activeOperations: Record<string, OperationEntry> | undefined;
  completedOperations: Record<string, CompletedOperationEntry> | undefined;
}

export function computeChildOwnedRanges(
  input: ChildOwnedRangesInput,
): ChildOwnedRanges {
  const timeline = input.timeline ?? [];
  const blockOrder = input.renderBlockOrder ?? [];
  const blockIds = new Set<string>();
  const callIds = new Set<string>();
  const reasoningRanges: Array<[number, number]> = [];
  const timelineRanges: Array<[number, number]> = [];

  for (const op of [
    ...Object.values(input.activeOperations ?? {}),
    ...Object.values(input.completedOperations ?? {}),
  ] as Array<OperationEntry & Partial<CompletedOperationEntry>>) {
    if (op.operation !== "sub_agent" || !op.toolCallId) continue;
    if (typeof op.blockAnchor === "number") {
      const end = Math.min(op.blockEnd ?? blockOrder.length, blockOrder.length);
      for (let i = op.blockAnchor; i < end; i++) blockIds.add(blockOrder[i]);
    }
    if (typeof op.timelineAnchor === "number") {
      timelineRanges.push([op.timelineAnchor, op.timelineEnd ?? Infinity]);
    }
    if (typeof op.reasoningAnchor === "number") {
      reasoningRanges.push([op.reasoningAnchor, op.reasoningEnd ?? Infinity]);
    }
  }

  if (timelineRanges.length > 0) {
    const seen = new Set<string>();
    for (let i = 0; i < timeline.length; i++) {
      const entry = timeline[i];
      if (entry.kind !== "tool_event") continue;
      const callId = entry.data.call_id;
      if (seen.has(callId)) continue;
      seen.add(callId);
      // A range opens AFTER its owner's first event, so a top-level owner is
      // never inside one; an owner nested in an outer range (the Weather Desk
      // call the Lane Planner made) is that outer child's work, and hides.
      if (isInside(timelineRanges, i)) callIds.add(callId);
    }
  }

  return {
    blockIds,
    callIds,
    isChildReasoning: (chunkStartIndex) =>
      reasoningRanges.some(
        ([start, end]) => chunkStartIndex >= start && chunkStartIndex < end,
      ),
  };
}

function isInside(
  ranges: ReadonlyArray<[number, number]>,
  index: number,
): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}
