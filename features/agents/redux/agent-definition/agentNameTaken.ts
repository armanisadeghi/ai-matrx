/**
 * THE CATALOG REFUSES A SECOND AGENT BY THE SAME NAME IN ONE ORGANIZATION (lane V24-TAILS,
 * VERIFIER-24: two agents both named "Agent Structure Builder" in Matrx System).
 *
 * The database says it (`agent._refuse_duplicate_agent_name`, 23505, hint `agent_name_taken`,
 * detail = the free name). This turns that refusal into the one sentence a person reads —
 * "An agent named "X" already exists in Y. Name this one "X (2)"." — and hands the offer back
 * so a control can apply it. Pure; the suite drives it.
 */

export interface AgentNameTaken {
  sentence: string;
  suggestion: string;
}

const SENTENCE = /An agent named "(.+)" already exists in .+?\. Name this one "(.+)"\./;

/** A PostgREST error from the refusal, or an Error / message that carries its sentence. */
export function agentNameTaken(error: unknown): AgentNameTaken | null {
  if (!error) return null;
  const e = error as { code?: unknown; hint?: unknown; details?: unknown; message?: unknown };
  const message = typeof error === "string" ? error : typeof e.message === "string" ? e.message : "";
  const m = SENTENCE.exec(message);
  if (!m) return null;
  const suggestion = typeof e.details === "string" && e.details.trim() !== "" ? e.details.trim() : m[2]!;
  return { sentence: m[0], suggestion };
}

/** The refusal as an Error whose message is the sentence alone (no code, hint or detail). */
export function agentNameTakenError(error: unknown): Error | null {
  const taken = agentNameTaken(error);
  return taken ? new Error(taken.sentence) : null;
}
