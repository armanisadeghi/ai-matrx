/**
 * The caller aborted its own request (unmount, a superseding search,
 * navigation): the answer is the caller's control flow, never an incident.
 * The ONE rule every server client's capture applies (callApi, python-client);
 * the Supabase capture applies the same rule to its chains
 * (`cancelledByCaller` in supabaseErrorCapture.ts).
 *
 * A caller signal aborted by a timeout (`TimeoutError` reason) is a failure and
 * still captures; so does any abort the caller did not ask for (its signal
 * untouched). Keyed on the caller's own signal, never on the error's label: the
 * transport's label for an abort differs by module copy (`abort_error` in the
 * browser, `network_error` "Request was aborted" under a duplicated package),
 * and whatever answered after the caller stopped listening is news to no one.
 */
export function cancelledByCaller(signal: AbortSignal | null | undefined): boolean {
  if (!signal?.aborted) return false;
  const reasonName = (signal.reason as { name?: unknown } | undefined)?.name;
  return reasonName !== "TimeoutError";
}

/**
 * The mark every NAMED caller abort carries. A transport turns the abort reason
 * into its answer's text (postgrest-js: `"AbortError: <reason.message>"`), so a
 * capture recognizes the caller's own cancellation from the failure alone —
 * even where it never saw the signal. A timeout never carries it.
 */
export const CALLER_ABORT_MARK = "cancelled-by-caller";

/**
 * The reason to abort with. Still an `AbortError` (every transport keeps its
 * abort semantics), but it says WHO stopped the request and WHY, so the abort
 * can never read as "signal is aborted without reason".
 */
export function callerAbortReason(why: string): DOMException {
  return new DOMException(`${CALLER_ABORT_MARK}: ${why}`, "AbortError");
}

/**
 * THE way code stops its own request: `controller.abort()` with a named
 * reason. Never call a bare `.abort()` on a controller whose signal reaches a
 * request — an unnamed abort is indistinguishable from a failure downstream.
 */
export function abortByCaller(
  controller: AbortController | null | undefined,
  why: string,
): void {
  controller?.abort(callerAbortReason(why));
}

/** True for a failure (or abort reason) produced by `abortByCaller`. */
export function isCallerAbortFailure(failure: unknown): boolean {
  if (!failure || typeof failure !== "object") return false;
  const { message, details } = failure as { message?: unknown; details?: unknown };
  const mark = `${CALLER_ABORT_MARK}:`;
  return (
    (typeof message === "string" && message.includes(mark)) ||
    (typeof details === "string" && details.includes(mark))
  );
}
