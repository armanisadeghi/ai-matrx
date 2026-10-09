/**
 * THE SERVER'S EMPTY READ IS NOT THE LAST WORD WHEN THE SERVER HAD NO IDENTITY.
 *
 * A record page reads its row during SSR and, on an empty or failed read,
 * renders `<AccessGate>`. But the SSR read runs on the request's cookie, and the
 * server client spends at most 2.5s refreshing an expired access token
 * (`@ai-matrx/data/next` identity budget). When that refresh is slow, the
 * budget is exhausted, auth-js drops the session, and the read goes out as
 * `anon`: `42501 permission denied` (or zero rows) for a record the person
 * owns. The gate then asked the browser, and a browser that could not verify
 * either was told "We can't tell you anything about it until we know who you
 * are" — the person's own older chats, unreadable (2026-10-07).
 *
 * So the browser re-asks with ITS session (refreshing it writes a fresh
 * cookie): readable → re-render the server page once; anything else → the
 * gate gives the honest answer.
 */

export type ServerReadRecheckVerdict =
  /** The browser can read the row: the SSR miss was the server's missing identity. */
  | "refresh"
  /** Show the access gate — the browser confirmed the row is not readable. */
  | "gate";

export function decideServerReadRecheck(input: {
  /** The browser verified who the person is. */
  signedIn: boolean;
  /** The browser's own read of the row returned it. */
  rowReadable: boolean;
  /** This page already re-rendered once for this record (never loop). */
  alreadyRefreshed: boolean;
}): ServerReadRecheckVerdict {
  if (input.alreadyRefreshed) return "gate";
  return input.signedIn && input.rowReadable ? "refresh" : "gate";
}
