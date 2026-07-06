/**
 * Short single-line label derived from a task title — for compact headers where
 * the full title is shown on a second row (Quick Tasks detail pane, etc.).
 */
export function buildTaskTitleLabel(
  title: string,
  maxLength = 56,
): { label: string; isTruncated: boolean } {
  const trimmed = title.trim().replace(/\s+/g, " ");
  if (!trimmed) return { label: "Untitled task", isTruncated: false };
  if (trimmed.length <= maxLength) {
    return { label: trimmed, isTruncated: false };
  }

  const slice = trimmed.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(" ");
  const cut =
    lastSpace > Math.floor(maxLength * 0.45)
      ? slice.slice(0, lastSpace)
      : slice.trimEnd();

  return { label: `${cut}…`, isTruncated: true };
}
