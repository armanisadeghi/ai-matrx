/**
 * Keep structured surface context structured across the browser/server boundary.
 *
 * The server's context tool intentionally rejects object/array values that were
 * JSON-encoded into strings: returning them as text would make a typed context
 * cell lie about its value. Refuse the same invalid shape before an agent run is
 * launched so the producer and key are actionable without spending a model call.
 */
export function assertNativeContextValue(key: string, value: unknown): void {
  if (typeof value !== "string") return;

  const trimmed = value.trim();
  const looksLikeContainer =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
  if (!looksLikeContainer) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (parsed === null || typeof parsed !== "object") return;

  const containerKind = Array.isArray(parsed) ? "array" : "object";
  throw new Error(
    `[surface-context] Context value "${key}" is a JSON ${containerKind} encoded as text. Pass the native ${containerKind} instead of JSON.stringify(...).`,
  );
}
