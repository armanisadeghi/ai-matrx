/**
 * Tool Call Visualization — Redux selectors.
 *
 * Thin re-exports + small composed selectors built on top of the canonical
 * selectors in features/agents/redux/execution-system/active-requests/.
 *
 * This feature does NOT own tool lifecycle state — it only reads from it.
 * The selectors here provide a stable public API for consumers of the
 * visualization feature so they don't have to reach into the agents
 * internals directly.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import {
  selectAllToolLifecycles as selectAllToolLifecyclesBase,
  selectToolCallIdsInOrder as selectToolCallIdsInOrderBase,
  selectToolLifecycle as selectToolLifecycleBase,
  selectToolLifecycleMap as selectToolLifecycleMapBase,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";

// Re-export the canonical per-call and per-request selectors under the
// tool-call-visualization namespace.
export const selectToolLifecycle = selectToolLifecycleBase;
export const selectToolLifecycleMap = selectToolLifecycleMapBase;
export const selectAllToolLifecycles = selectAllToolLifecyclesBase;
export const selectToolCallIdsInOrder = selectToolCallIdsInOrderBase;

/**
 * Entries returned in the order their tool_started event appeared on the
 * timeline. Stable ref until lifecycle or timeline changes.
 *
 * Use this in the canonical shell to render tool cards in emission order.
 */
export const selectOrderedToolLifecycles = (requestId: string) =>
  createSelector(
    (state: RootState) =>
      state.activeRequests.byRequestId[requestId]?.toolLifecycle,
    (state: RootState) => state.activeRequests.byRequestId[requestId]?.timeline,
    (lifecycle, timeline): ToolLifecycleEntry[] => {
      if (!lifecycle) return [];
      if (!timeline || timeline.length === 0) {
        return Object.values(lifecycle);
      }
      const seen = new Set<string>();
      const out: ToolLifecycleEntry[] = [];
      for (const entry of timeline) {
        if (
          entry.kind === "tool_event" &&
          entry.data.event === "tool_started" &&
          !seen.has(entry.data.call_id)
        ) {
          seen.add(entry.data.call_id);
          const lc = lifecycle[entry.data.call_id];
          if (lc) out.push(lc);
        }
      }
      // Include any lifecycle entries that weren't captured on the timeline
      // (e.g. seeded from persisted history without a real tool_started).
      for (const [callId, lc] of Object.entries(lifecycle)) {
        if (!seen.has(callId)) out.push(lc);
      }
      return out;
    },
  );

