import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

/**
 * The calls in a tool group that still speak for it.
 *
 * An agent that calls a tool with bad arguments, reads the refusal, and calls
 * the SAME tool again successfully has corrected itself. The first call's
 * failure is history, not the group's outcome — labelling the group "Couldn't
 * ask" above an ask that was answered is a screen that lies.
 *
 * A failed call is dropped when a LATER call of the same tool in the group
 * completed (or is still running — the retry is under way). Every other entry
 * is kept, in order. The full list still reaches the overlay and the window,
 * so the corrected failure stays one click away.
 */
export function withoutCorrectedFailures(
  entries: ToolLifecycleEntry[],
): ToolLifecycleEntry[] {
  return entries.filter((entry, index) => {
    if (entry.status !== "error") return true;
    return !entries
      .slice(index + 1)
      .some((later) => later.toolName === entry.toolName && later.status !== "error");
  });
}
