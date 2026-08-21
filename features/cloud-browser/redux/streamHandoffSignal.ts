/**
 * The `human_required` signal, read out of a streamed cloud-browser tool result.
 *
 * The browser tools end their turn by returning `status: "human_required"` — the
 * agent has stopped and a person is needed. That result rides the ordinary chat
 * stream as `tool_completed`, so the chat is where the surface first learns a
 * handoff exists. This is the pure half of that seam (`adoptRunFromStream.ts` is
 * the effectful half); it is a plain function so the decision is testable
 * without a stream.
 *
 * The two producers name the episode differently and BOTH must be honoured:
 *   - `cloud_browser*` returns `session_id` — the run id (tools.py `_result`).
 *   - `credential_login` returns `handoff_id` and no run id (credential_login.py
 *     `_safe`), so the run is resolved from the handoff row.
 * Anything else is ignored — never guess an id we were not given.
 */

export interface BrowserHandoffSignal {
  runId: string | null;
  handoffId: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Non-null only for a completed cloud-browser tool that stopped for a person. */
export function readHumanRequiredSignal(
  event: string,
  toolName: unknown,
  result: unknown,
): BrowserHandoffSignal | null {
  if (event !== "tool_completed") return null;
  if (typeof toolName !== "string") return null;
  if (!toolName.startsWith("cloud_browser") && toolName !== "credential_login")
    return null;
  if (!result || typeof result !== "object" || Array.isArray(result))
    return null;

  const payload = result as Record<string, unknown>;
  if (payload.status !== "human_required") return null;

  const runId = text(payload.session_id);
  const handoffId = text(payload.handoff_id);
  if (!runId && !handoffId) return null;
  return { runId, handoffId };
}
