/**
 * agent-run-output — THE reader for what an `ai.agent.start` node produced.
 *
 * An agent node's `node_completed.output` is the agent-run ENVELOPE, not the
 * answer: alongside `final_text` / `structured_output` it carries `messages`
 * (the full prompt, verbatim), `usage` (token counts and cost), `metadata`,
 * `request_id`, `conversation_id`. Rendering that object is a leak — on the
 * Study Pack run it put the system prompt, the model id and the token bill
 * into the box a learner was waiting on. It is also useless: the thing the
 * person wanted is two keys deep.
 *
 * So every surface that renders a workflow agent step's settled output reads
 * it through here, and shows ONLY what the agent produced.
 *
 * Pure module — returns values, renders nothing. The caller hands the result
 * to the canonical pipeline (`MarkdownStream` / the kind registry); this never
 * parses a stream and never formats.
 *
 * NOTE for whoever converges these: two ad-hoc readers of `final_text` already
 * exist (`features/agents/components/assignment-demo/AgentAssignmentsDemo.tsx`,
 * `features/masterwork/service.ts` via a `output->>final_text` select). They
 * predate this module and should adopt it rather than a third copy appearing.
 */

export interface AgentRunOutputView {
  /** The text the agent produced. Null when it produced none. */
  finalText: string | null;
  /** The schema-bound payload, when the agent was bound to one. */
  structured: Record<string, unknown> | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read an agent-run envelope, or null when `output` is not one (an ordinary
 * transform's output, a tool result, anything else) — callers fall through to
 * their normal rendering on null, so a non-agent step is never touched.
 */
export function readAgentRunOutput(
  output: Record<string, unknown> | null,
): AgentRunOutputView | null {
  if (!output) return null;
  const hasFinalText = typeof output.final_text === "string";
  // The envelope shape: `final_text` alone is enough, and a run that produced
  // no text is still recognisable by the transcript + usage pair.
  const looksLikeEnvelope =
    hasFinalText || (Array.isArray(output.messages) && isRecord(output.usage));
  if (!looksLikeEnvelope) return null;

  const finalText =
    hasFinalText && (output.final_text as string).trim().length > 0
      ? (output.final_text as string)
      : null;
  const structured =
    isRecord(output.structured_output) &&
    Object.keys(output.structured_output).length > 0
      ? output.structured_output
      : null;

  return { finalText, structured };
}

/** True when a string is (almost certainly) a JSON document, not prose. */
export function looksLikeJsonDocument(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}
