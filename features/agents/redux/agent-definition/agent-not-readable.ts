// features/agents/redux/agent-definition/agent-not-readable.ts
//
// "This agent is not readable by you" is an EXPECTED refusal — another
// organization's agent behind a conversation or a shared app — and every
// surface that meets it already tells the person. The telling-apart and the
// logging live once, in lib/errors/expectedRefusal.ts (`logFailure`); this
// module only builds and recognises the agent's own refusal.

import { expectedRefusal, expectedRefusalCode } from "@/lib/errors/expectedRefusal";

export const AGENT_NOT_READABLE = "agent_not_readable" as const;

export function agentNotReadableError(agentId: string): Error & { code: string } {
  return expectedRefusal(
    AGENT_NOT_READABLE,
    `Agent ${agentId} is not readable by you (no execution payload returned).`,
  );
}

/** True for the not-readable refusal — as thrown, or as serialized by a thunk's `.unwrap()`. */
export function isAgentNotReadable(err: unknown): boolean {
  return expectedRefusalCode(err) === AGENT_NOT_READABLE;
}
