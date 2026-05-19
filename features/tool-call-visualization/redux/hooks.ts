/**
 * Tool Call Visualization — React hooks.
 *
 * Thin hooks over the canonical selectors. Components should use these
 * instead of importing selectors directly so the wiring can be refactored
 * without touching every consumer.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import {
  selectOrderedToolLifecycles,
  selectToolCallIdsInOrder,
  selectToolLifecycle,
} from "./selectors";

/**
 * All tool lifecycle entries for this request, in stream (tool_started) order.
 * Used ONLY by the floating-window debug surface
 * (`ToolCallWindowPanel`). The chat transcript renders one card per
 * `callId` and never subscribes to "all tools for the request" — doing
 * that produced the legacy "every card shows every tool" bug.
 */
export function useOrderedToolLifecycles(
  requestId: string,
): ToolLifecycleEntry[] {
  return useAppSelector(selectOrderedToolLifecycles(requestId));
}

/** The callIds that have a tool_started event, in emission order. */
export function useToolCallIdsInOrder(requestId: string): string[] {
  return useAppSelector(selectToolCallIdsInOrder(requestId));
}

/** A single tool lifecycle entry by callId. */
export function useToolLifecycle(
  requestId: string,
  callId: string,
): ToolLifecycleEntry | undefined {
  return useAppSelector(selectToolLifecycle(requestId, callId));
}
