/** Structured extraction values use the table host's canonical JSON viewer. */
export function parseStructuredCellValue(value: string): object | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function structuredCellSummary(value: object): string {
  return Array.isArray(value)
    ? `${value.length} item${value.length === 1 ? "" : "s"}`
    : Object.keys(value).slice(0, 3).join(", ") || "Empty object";
}
