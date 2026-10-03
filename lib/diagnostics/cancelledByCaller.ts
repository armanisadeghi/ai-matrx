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
