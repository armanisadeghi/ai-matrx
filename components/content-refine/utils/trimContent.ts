export function applyTrim(
  content: string,
  trimStart: number,
  trimEnd: number,
): string {
  if (!content) return "";
  const len = content.length;
  const start = Math.max(0, Math.min(trimStart, len));
  const remaining = Math.max(0, len - start);
  const end = Math.max(0, Math.min(trimEnd, remaining));
  return content.slice(start, len - end);
}
