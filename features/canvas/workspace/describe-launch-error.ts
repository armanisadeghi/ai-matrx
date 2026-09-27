/**
 * Name the real cause of a failed launch or load. A thunk `.unwrap()` rejects
 * with a SerializedError or a `rejectWithValue` payload — plain objects, not
 * Errors — so `String(error)` would print "[object Object]".
 *
 * (Same reading as the interim spatial chat's helper, which is slated for
 * deletion once the spatial board moves onto ChatCanvasWorkspace.)
 */
export function describeLaunchError(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const nested = record.error;
    const text = [record.user_message, record.userMessage, record.message, record.detail].find(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    const code = [record.code, record.name].find(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    if (text) return code && !text.includes(code) ? `${text} (${code})` : text;
    if (nested !== undefined && nested !== error) return describeLaunchError(nested);
    if (code) return `It failed with ${code}, and no further detail.`;
    try {
      return `It failed: ${JSON.stringify(error).slice(0, 300)}`;
    } catch {
      // fall through to the generic sentence below
    }
  }
  return "It failed without saying why.";
}
