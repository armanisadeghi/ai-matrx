/**
 * agent-run-output — THE reader for an agent-run envelope (`agent_result`).
 *
 * An agent node's `node_completed.output` is the agent-run ENVELOPE, not the
 * answer: alongside `final_text` / `structured_output` it carries `messages`
 * (the full prompt, verbatim), `usage` (token counts and cost), `metadata`,
 * `request_id`, `conversation_id`. Rendering that object is a leak — on the
 * Study Pack run it put the system prompt, the model id and the token bill
 * into the box a learner was waiting on. It is also useless: the thing the
 * person wanted is two keys deep.
 *
 * So every surface that reads an agent-run envelope reads it through here, and
 * shows ONLY what the agent produced (plus the run FACTS, which are numbers
 * about the run, never its content).
 *
 * `messages` is deliberately absent from every type in this module. Not
 * "filtered later" — never read, so no consumer can leak it by forgetting to.
 * The transcript stays reachable the honest way: `facts.conversationId` is a
 * door to the conversation itself, where access is decided by the database.
 *
 * Pure module — returns values, imports nothing, renders nothing. The caller
 * hands the result to the canonical pipeline (`MarkdownStream` / the kind
 * registry); this never parses a stream and never formats.
 *
 * Consumers (all of them — a third ad-hoc reader of `final_text` is a defect):
 * - `features/content-ir/kinds/agent-result.ts` — the `agent_result` kind's
 *   bridge, i.e. what THE component renders everywhere the kind appears.
 * - `features/workflow-runtime/components/readout-parts.tsx` — the interim
 *   fallback for a settled step whose kind has no component.
 * - `features/agents/components/assignment-demo/AgentAssignmentsDemo.tsx`
 * - `features/masterwork/service.ts`
 */

/** What the agent produced — the only two keys a reader ever wants. */
export interface AgentRunOutputView {
  /** The text the agent produced. Null when it produced none. */
  finalText: string | null;
  /** The schema-bound payload, when the agent was bound to one. */
  structured: Record<string, unknown> | unknown[] | null;
}

/**
 * Numbers about the run — what it cost, how long it took, how hard it worked.
 * Secondary detail: a reader may want it, but it is never the content, and
 * every field is optional because a producer may not track it.
 */
export interface AgentRunFacts {
  durationMs: number | null;
  iterations: number | null;
  toolCalls: number | null;
  costUsd: number | null;
  totalTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  finishReason: string | null;
  /** Canonical model names that billed this run, in `usage.models` order. */
  models: string[];
  /** The conversation this run wrote to — a door, when the run stored one. */
  conversationId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A finite number, or null — `0` is a real answer and survives. */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A non-blank string, or null. */
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * True when `output` is an agent-run envelope. `final_text` alone is enough,
 * and a run that produced no text is still recognisable by the transcript +
 * usage pair.
 */
export function isAgentRunEnvelope(
  output: Record<string, unknown> | null | undefined,
): boolean {
  if (!output) return false;
  return (
    typeof output.final_text === "string" ||
    (Array.isArray(output.messages) && isRecord(output.usage))
  );
}

/**
 * Read an agent-run envelope, or null when `output` is not one (an ordinary
 * transform's output, a tool result, anything else) — callers fall through to
 * their normal rendering on null, so a non-agent step is never touched.
 */
export function readAgentRunOutput(
  output: Record<string, unknown> | null,
): AgentRunOutputView | null {
  if (!output || !isAgentRunEnvelope(output)) return null;

  const finalText =
    typeof output.final_text === "string" && output.final_text.trim() !== ""
      ? output.final_text
      : null;

  const raw = output.structured_output;
  const structured =
    isRecord(raw) && Object.keys(raw).length > 0
      ? raw
      : Array.isArray(raw) && raw.length > 0
        ? raw
        : null;

  return { finalText, structured };
}

/**
 * Read the run FACTS off the same envelope. Never reads `messages`; the
 * message COUNT is not a fact anyone acts on, so it is not one either.
 */
export function readAgentRunFacts(
  output: Record<string, unknown> | null,
): AgentRunFacts | null {
  if (!output || !isAgentRunEnvelope(output)) return null;

  const usage = isRecord(output.usage) ? output.usage : {};
  const metadata = isRecord(output.metadata) ? output.metadata : {};
  const models = isRecord(usage.models) ? Object.keys(usage.models) : [];

  return {
    durationMs: num(output.duration_ms),
    iterations: num(output.iterations),
    toolCalls: num(output.tool_calls_made),
    costUsd: num(usage.cost_usd),
    totalTokens: num(usage.total_tokens),
    inputTokens: num(usage.input_tokens),
    outputTokens: num(usage.output_tokens),
    finishReason: text(output.finish_reason) ?? text(metadata.finish_reason),
    // A single-model run often reports the name only in metadata.
    models:
      models.length > 0
        ? models
        : [text(metadata.matrx_model_name)].filter(
            (m): m is string => m !== null,
          ),
    conversationId: text(output.conversation_id),
  };
}

/** True when a string is (almost certainly) a JSON document, not prose. */
export function looksLikeJsonDocument(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}
