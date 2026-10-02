/**
 * Escapes triple-backtick code fences embedded in prompt message content
 * so they appear as literal text rather than being interpreted as markdown
 * code blocks by the rendering pipeline.
 *
 * This is necessary because prompt templates often include code fence
 * examples as part of their instructions (e.g., "respond in ```json ...```").
 * When this content is rendered through MarkdownStream, the parser
 * (splitContentIntoBlocksV2) treats those fences as real code block
 * delimiters, corrupting the display.
 *
 * Strategy: insert a zero-width space between each backtick to break the
 * triple-backtick pattern while keeping the characters visually identical.
 */
export function escapeEmbeddedCodeFences(text: string): string {
  return text.replace(/```(\w*)/g, (_match, lang) => {
    const escaped = '`\u200B`\u200B`';
    return lang ? `${escaped}${lang}` : escaped;
  });
}
