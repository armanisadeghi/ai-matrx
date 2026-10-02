import type { ToolCallBlock } from "@/lib/chat-protocol/types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

/**
 * Map a canonical chat-protocol `ToolCallBlock` into the `ToolLifecycleEntry`
 * shape consumed by `ToolCallVisualization`.
 *
 * Used only by non-agent-runner surfaces — places where tool data arrives as
 * chat-protocol blocks (persisted messages, public chat replay, stream-aware
 * markdown) rather than through the live execution pipeline that populates
 * `features/agents/redux/activeRequests`. The live pipeline already produces
 * full `ToolLifecycleEntry` values with accurate timestamps, progress events,
 * and error metadata; this mapping is a best-effort synthesis from the
 * flattened block shape, so fields like `startedAt`, `latestMessage`,
 * `latestData`, and `events` are placeholders.
 *
 * @param block - A canonical tool-call block (`phase`, `callId`, `toolName`,
 *   optional `input`, `output`, `error`).
 * @returns A `ToolLifecycleEntry` whose `status` is derived from `block.phase`
 *   (`complete` → `completed`, `error` → `error`, `running` → `progress`,
 *   otherwise `started`), with `arguments` unwrapped from either
 *   `input.arguments` or `input` itself, and `result` unwrapped from
 *   `output.result` when present, falling back to `output`.
 */
export function toolCallBlockToLifecycleEntry(
  block: ToolCallBlock,
): ToolLifecycleEntry {
  const now = new Date().toISOString();
  const status: ToolLifecycleEntry["status"] =
    block.phase === "complete"
      ? "completed"
      : block.phase === "error"
        ? "error"
        : block.phase === "running"
          ? "progress"
          : "started";

  const rawArgs: unknown =
    (block.input as { arguments?: unknown })?.arguments ??
    (block.input as unknown) ??
    {};
  const args: Record<string, unknown> =
    rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
      ? (rawArgs as Record<string, unknown>)
      : {};

  return {
    callId: block.callId,
    toolName: block.toolName,
    displayName: block.toolName,
    status,
    arguments: args,
    startedAt: now,
    completedAt:
      block.phase === "complete" || block.phase === "error" ? now : null,
    latestMessage: null,
    latestData: null,
    result:
      block.output !== undefined
        ? ((block.output as { result?: unknown }).result ?? block.output)
        : null,
    resultPreview: null,
    errorType: null,
    errorMessage: block.error ? String(block.error) : null,
    isDelegated: false,
    events: [],
  };
}
