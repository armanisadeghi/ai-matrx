/**
 * Plain words for a failed agent run, for any surface that has its own generic
 * sentence ("That did not come out right"). A usage cap or an approval gate is
 * not a bad answer: the person is told the real reason, in the same words the
 * usage gate uses everywhere else (`USAGE_BLOCKED_MESSAGE`); everything else
 * returns `fallback` so the surface keeps its own sentence.
 *
 * Duck-typed on `{ message, detail }` (HeadlessAgentRunError's shape) so the
 * chat package class is not imported here.
 */
import { USAGE_BLOCKED_MESSAGE } from "./usageGate";

const USAGE_CODES = /usage_limit_reached|guest_ai_allowance_used|plan_limit|cap_reached/i;
const APPROVAL_CODES = /requires?_approval|approval_required|not_approved|pending_approval|awaiting_approval|agent_not_approved/i;
const GENERIC_MESSAGE = /^(the agent run failed|that stopped|something went wrong)/i;

export const APPROVAL_BLOCKED_MESSAGE = "This agent needs approval before it can run.";

function partsOf(err: unknown): { message: string; detail: string } {
  if (typeof err !== "object" || err === null) return { message: "", detail: "" };
  const e = err as { message?: unknown; detail?: unknown };
  return {
    message: typeof e.message === "string" ? e.message.trim() : "",
    detail: typeof e.detail === "string" ? e.detail : "",
  };
}

export type AgentRunFailureKind = "usage" | "approval" | "other";

export function classifyAgentRunFailure(err: unknown): AgentRunFailureKind {
  const { message, detail } = partsOf(err);
  const text = `${detail} ${message}`;
  if (USAGE_CODES.test(text)) return "usage";
  if (APPROVAL_CODES.test(text)) return "approval";
  return "other";
}

export function agentRunFailureWords(err: unknown, fallback: string): string {
  const kind = classifyAgentRunFailure(err);
  if (kind === "other") return fallback;
  const { message } = partsOf(err);
  // The server's own sentence wins when it is a real, short, human one.
  const human = message !== "" && message.length <= 160 && !GENERIC_MESSAGE.test(message) && !/[_]{1}[a-z]+_/.test(message);
  if (kind === "usage") return human && /limit|plan|allowance|upgrade/i.test(message) ? message : USAGE_BLOCKED_MESSAGE;
  return human && /approv/i.test(message) ? message : APPROVAL_BLOCKED_MESSAGE;
}
