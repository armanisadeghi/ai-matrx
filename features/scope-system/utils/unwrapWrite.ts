import type { RecordsResult } from "@ai-matrx/records";

/**
 * A scope write's answer as its data, or a thrown Error carrying the store's own sentence —
 * for callers that run the write inside a try/catch toast path.
 */
export function unwrapWrite<T>(res: RecordsResult<T>): T {
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}
