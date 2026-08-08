/**
 * Shared clipboard + payload-size helpers for the agent-copy primitives.
 * One implementation — CopyButtons, AiCopyMenu, and the Groomer all use these;
 * never re-roll a clipboard write or a token estimate at a callsite.
 */

export async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

/** Rough token estimate (chars / 4) — same convention as the Groomer window. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function fmtBytes(b: number): string {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}
