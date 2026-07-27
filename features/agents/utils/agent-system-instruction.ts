/**
 * Flatten an agent definition's system message into plain instruction text.
 *
 * The system message's `content` is an array of blocks; the canonical text
 * field is `.text` (normalised at the Redux boundary). Non-text blocks (files,
 * images) carry no instruction text and are skipped.
 *
 * Shared by the agent-builder and agent-run surface scope emitters, which both
 * publish the agent's system instruction as a surface value.
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
