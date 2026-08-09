/**
 * Read and write an agent definition's system instruction.
 *
 * The system prompt is NOT a plain field on the agent record — it lives inside
 * `messages` as the `role: "system"` entry, whose `content` is an array of
 * blocks. `extractAgentSystemInstruction` is the read side (used by the
 * agent-builder and agent-run surface scope emitters);
 * `withAgentSystemInstruction` is the write side — the ONE place that knows how
 * to rebuild the messages array around new instruction text.
 */

import type { AgentDefinitionMessage } from "@/features/agents/types/agent-message-types";

/**
 * Flatten an agent definition's system message into plain instruction text.
 *
 * The canonical text field is `.text` (normalised at the Redux boundary).
 * Non-text blocks (files, images) carry no instruction text and are skipped.
 */
export function extractAgentSystemInstruction(
  systemMessage: { content?: unknown } | undefined,
): string | undefined {
  const blocks = systemMessage?.content;
  if (!Array.isArray(blocks)) return undefined;
  const text = blocks
    .filter(
      (b): b is { type?: string; text?: string } =>
        !!b && typeof b === "object" && (b as { type?: string }).type === "text",
    )
    .map((b) => b.text ?? "")
    .filter(Boolean)
    .join("\n");
  return text.length > 0 ? text : undefined;
}

/**
 * The messages array with the system instruction text replaced by `text`.
 *
 * Mirrors exactly what the builder's System Prompt textarea does on every
 * keystroke (`SystemMessage.handleTextChange`), which is why that component
 * calls this too — there is ONE rebuild rule, not one per caller:
 *
 *  - the system message's non-text blocks (files, images, variable blocks) are
 *    round-tripped untouched — replacing the prompt text must never drop them;
 *  - the text block is dropped entirely when `text` is blank, and the system
 *    message itself is dropped when that leaves it with no blocks at all;
 *  - the system message stays first and every non-system priming turn keeps
 *    its order.
 *
 * Pure: returns a new array, mutates nothing. Dispatch the result through
 * `setAgentMessages` — the same action the user's typing dispatches.
 */
export function withAgentSystemInstruction(
  messages: AgentDefinitionMessage[],
  text: string,
): AgentDefinitionMessage[] {
  const systemMessage = messages.find((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  // MATRX-EXCEPTION: the block editor works on loose records so one generic UI
  // can edit any block type by field; we re-narrow at the write-back below.
  const preservedNonText = (
    Array.isArray(systemMessage?.content)
      ? (systemMessage.content as unknown as Record<string, unknown>[])
      : []
  ).filter((b) => b.type !== "text") as unknown as
    AgentDefinitionMessage["content"];

  const newContent: AgentDefinitionMessage["content"] = text.trim()
    ? [{ type: "text", text }, ...preservedNonText]
    : preservedNonText;

  return newContent.length > 0
    ? [{ role: "system", content: newContent }, ...nonSystemMessages]
    : nonSystemMessages;
}
