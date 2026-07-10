/**
 * Pure fence ↔ R1 rewrite helpers for attachBlockAsEditableContext.
 * Kept dependency-free so identical-fence behavior is unit-testable.
 */

export interface TextContentBlock {
  type?: string;
  text?: string;
  [key: string]: unknown;
}

function isTextBlock(b: TextContentBlock): boolean {
  return b.type === "text";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Soft fence matcher — language info-string + body between triple backticks. */
export function softFenceRegex(language: string, body: string): RegExp {
  return new RegExp(
    "```" +
      escapeRegExp(language || "") +
      "\\s*\\n" +
      escapeRegExp(body) +
      "\\n```",
    "g",
  );
}

/**
 * Replace EVERY matching fence in the message with the same R1 artifact tag.
 * Identical fences share one canvas UUID. Returns null when no fence is found.
 */
export function rewriteAllMatchingFences(
  content: TextContentBlock[],
  language: string,
  body: string,
  wire: string,
  fenceMarkdown: string,
): TextContentBlock[] | null {
  let replaced = false;
  const out: TextContentBlock[] = content.map((block) => {
    if (!isTextBlock(block)) return block;
    let text = typeof block.text === "string" ? block.text : "";
    if (text.includes(fenceMarkdown)) {
      const next = text.split(fenceMarkdown).join(wire);
      if (next !== text) {
        replaced = true;
        text = next;
      }
    }
    const soft = softFenceRegex(language, body);
    if (soft.test(text)) {
      soft.lastIndex = 0;
      const next = text.replace(soft, wire);
      if (next !== text) {
        replaced = true;
        text = next;
      }
    }
    if (text === (typeof block.text === "string" ? block.text : "")) {
      return block;
    }
    return { ...block, text };
  });
  return replaced ? out : null;
}

/** True when any text block still contains a raw fence for this body. */
export function messageStillHasFence(
  content: TextContentBlock[],
  language: string,
  body: string,
  fenceMarkdown: string,
): boolean {
  const soft = softFenceRegex(language, body);
  for (const block of content) {
    if (!isTextBlock(block)) continue;
    const text = typeof block.text === "string" ? block.text : "";
    if (text.includes(fenceMarkdown)) return true;
    soft.lastIndex = 0;
    if (soft.test(text)) return true;
  }
  return false;
}
