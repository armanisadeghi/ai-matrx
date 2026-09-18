import { KIND_KEY } from "@ai-matrx/content-ir";
import { NODE_OUTCOME_KIND } from "@ai-matrx/content-ir/wire";

import { readAgentRunOutput } from "./agent-run-output";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Select only the complete document shown by a workflow renderer. Agent
 * envelopes also carry prompts, usage, and IDs; those must never become the
 * content passed to Copy, Save to Notes, or Save to Task.
 */
export function workflowDocumentText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() ? value : null;
  const data = record(value);
  if (!data) return null;

  const agent = readAgentRunOutput(data);
  if (agent) {
    if (agent.content.length > 0) {
      const markdownParts = agent.content.map((entry) =>
        entry.kind === "markdown" ? record(entry.value)?.text : null,
      );
      return markdownParts.every(
        (text): text is string => typeof text === "string" && !!text.trim(),
      )
        ? markdownParts.join("\n\n")
        : null;
    }
    // The kind component gives schema-bound content precedence over final_text.
    // A text action on that fallback would save a different document.
    return agent.structured ? null : agent.finalText;
  }

  // Only the canonical runtime wrapper delegates its output. A generic object
  // may also have an `output` field beside other reader-visible fields; taking
  // that field alone would make actions save a partial document.
  if (data[KIND_KEY] === NODE_OUTCOME_KIND && data.output !== undefined) {
    return workflowDocumentText(data.output);
  }

  // A kindless output.to_frontend payload may carry one document field. Never
  // choose one field from a multi-field structured result and silently omit
  // the others from an action.
  const fields = Object.entries(data).filter(([key]) => key !== KIND_KEY);
  if (fields.length !== 1) return null;
  const [key, text] = fields[0];
  if (!/^(text|markdown|content|body|instructions|message|value)$/i.test(key)) {
    return null;
  }
  return typeof text === "string" && text.trim() ? text : null;
}
