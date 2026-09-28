// features/agents/redux/agent-definition/agent-not-readable.ts
//
// "This agent is not readable by you" is an EXPECTED refusal — another
// organization's agent behind a conversation or a shared app — and every
// surface that meets it already tells the person (a toast, a fallback door, a
// read-failure panel). Logging it with console.error made the Next dev overlay
// show a red "1 Issue" on a page that was behaving correctly (verifier round 3,
// claim 11). The refusal carries a code; `logAgentLoadFailure` records it as
// information and keeps console.error for failures nobody expected.

export const AGENT_NOT_READABLE = "agent_not_readable";

export function agentNotReadableError(agentId: string): Error & { code: string } {
  return Object.assign(
    new Error(`Agent ${agentId} is not readable by you (no execution payload returned).`),
    { code: AGENT_NOT_READABLE },
  );
}

/** True for the not-readable refusal — as thrown, or as serialized by a thunk's `.unwrap()`. */
export function isAgentNotReadable(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === AGENT_NOT_READABLE
  );
}

/** Log a failed agent load: the expected refusal as information, anything else as an error. */
export function logAgentLoadFailure(tag: string, err: unknown): void {
  if (isAgentNotReadable(err)) {
    console.info(`${tag} agent not readable by this person (handled on screen)`, err);
    return;
  }
  console.error(tag, err);
}
