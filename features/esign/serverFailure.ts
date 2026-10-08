// features/esign/serverFailure.ts — what a failed call says, honestly (law 4).
// "We could not reach AI Matrx" is true only when no answer came back. When the server (or the
// database door) answered with an error, the failure is ours, and the words must say so and carry the
// request id so a person can quote it.

export const NOT_REACHED = "We could not reach AI Matrx just now. Try again in a moment.";

interface FailureLike {
  status?: number | undefined;
  code?: string | undefined;
  serverDetail?: unknown;
}

function record(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** The server's request id, wherever its error envelope put it. */
export function requestIdOf(error: FailureLike | null | undefined): string | null {
  const body = record(error?.serverDetail);
  const inner = record(body?.detail);
  const id = inner?.request_id ?? body?.request_id;
  return typeof id === "string" && id !== "" ? id : null;
}

/** True when something answered: an HTTP status, or a database error code. */
export function wasAnswered(error: FailureLike | null | undefined): boolean {
  return Boolean(error && ((typeof error.status === "number" && error.status > 0) || error.code));
}

/** The sentence for a failure that carried no explanation of its own. */
export function failureSentence(error: FailureLike | null | undefined): string {
  if (!wasAnswered(error)) return NOT_REACHED;
  const id = requestIdOf(error);
  return `AI Matrx hit an error on our side. Try again; if it keeps failing, quote ${id ? `request ${id}` : "the time you tried"}.`;
}
