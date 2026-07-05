export function stripThinking(input: string): string {
  if (!input) return "";
  return input
    .replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<reasoning[^>]*>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasThinkingTags(input: string): boolean {
  if (!input) return false;
  return /<(thinking|reasoning)[^>]*>[\s\S]*?<\/\1>/i.test(input);
}

/**
 * Streaming-aware variant: handles partial `<thinking>` / `<reasoning>` blocks
 * whose closing tag hasn't arrived yet. Returns:
 *   - `visible`: text with all *closed* thinking/reasoning blocks removed AND
 *     any currently-open thinking block truncated (so the partial chain-of-
 *     thought never reaches the textarea or the clipboard).
 *   - `isThinking`: true when the stream is currently inside an unclosed
 *     `<thinking>` or `<reasoning>` tag — callers can render a "thinking..."
 *     animation while waiting for the close tag.
 */
export function stripThinkingStreaming(input: string): {
  visible: string;
  isThinking: boolean;
} {
  if (!input) return { visible: "", isThinking: false };

  // Remove all fully-closed thinking/reasoning blocks first.
  let text = input
    .replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<reasoning[^>]*>[\s\S]*?<\/reasoning>/gi, "");

  // Look for an unclosed opening tag — everything from it onward is the
  // partial chain-of-thought and must be hidden until the closer arrives.
  const openMatch = text.match(/<(thinking|reasoning)[^>]*>/i);
  const isThinking = !!openMatch;
  if (openMatch && openMatch.index !== undefined) {
    text = text.slice(0, openMatch.index);
  }

  return {
    visible: text.replace(/\n{3,}/g, "\n\n").replace(/^\s+/, ""),
    isThinking,
  };
}
