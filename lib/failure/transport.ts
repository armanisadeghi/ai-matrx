/**
 * lib/failure/transport.ts — A TRANSPORT REFUSAL IS NOT A SENTENCE.
 *
 * THE DEFECT THIS EXISTS FOR (production walk, 2026-09-08). Setting a mandate's
 * bottom-rung holder failed with a toast reading, in full:
 *
 *     Failed to fetch
 *
 * An identical retry then succeeded. Two laws broken at once: a screen said
 * something no person can act on, and an automatic condition (the request never
 * completed) announced itself without a remedy. The retry succeeding makes it
 * worse — the person was told a lie about a save that a single click would have
 * completed.
 *
 * `Failed to fetch` is not the server's word. It is the BROWSER'S word for "the
 * request did not complete", and it carries a fact that matters more than the
 * string: nobody knows whether the server acted. A write may have landed, may
 * not have. That uncertainty belongs on the screen, with the remedy attached.
 *
 * THE SECOND HALF (wall W2, 2026-09-15). The same law broke the other way on
 * `/masterwork/new?approach=interview`: an Expert was shown, verbatim, on the
 * page and in a toast:
 *
 *     canceling statement due to statement timeout (57014)
 *
 * That is Postgres talking to a DBA. It is not a sentence, it names no remedy,
 * and the Expert who read it had done nothing wrong — the database simply did
 * not answer inside its eight seconds. `describeFailure` used to pass every
 * PostgREST message through untouched, on the reasoning that "a door's own
 * refusal passes through word for word". A DOOR'S REFUSAL AND POSTGRES'S OWN
 * WORDS ARE NOT THE SAME THING: our RPCs raise sentences written for people;
 * the engine raises SQLSTATE prose written for operators. Recognised by
 * SQLSTATE (and by the engine's verbatim phrasings when the code is lost),
 * those are now rewritten and marked transient, so the screen offers a retry
 * instead of a diagnosis.
 *
 * This module turns any thrown thing into `{ sentence, remedy, transient }`.
 * `transient` is the one that drives UI: when it is true, a RETRY is the
 * remedy, and `lib/failure/toastFailure.ts` puts a Retry button on the toast.
 * A door's own refusal (a `MandateDoorError`, a PostgREST message, anything
 * written for a person) passes through untouched — this never overwrites words
 * the server chose.
 */

/**
 * Every browser's way of saying "the fetch did not complete". These are
 * verbatim strings, matched exactly rather than fuzzily, so a real server
 * message that happens to contain the word "fetch" is never rewritten.
 */
const TRANSPORT_MESSAGES = new Set([
  "Failed to fetch", // Chromium
  "Load failed", // Safari
  "NetworkError when attempting to fetch resource.", // Firefox
  "Network request failed", // React Native / undici
  "fetch failed", // undici (server-side)
  "The Internet connection appears to be offline.", // Safari, offline
  "TypeError: Failed to fetch", // already-stringified, seen from supabase-js
]);

/** Error names that mean the request was cut short rather than answered. */
const CUT_SHORT = new Set(["AbortError", "TimeoutError"]);

export interface FailureSentence {
  /** What happened, in words for a person. */
  sentence: string;
  /** What to do about it. Empty when there is nothing useful to say. */
  remedy: string;
  /** True when trying again is the remedy — the screen should offer it. */
  transient: boolean;
  /** The original string, for the Error Inspector. Never shown alone. */
  raw: string;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  // Deliberately NOT String(error): "[object Object]" is a non-empty string
  // that would silence a caller's fallback and print gibberish at a person.
  return typeof error === "number" || typeof error === "boolean"
    ? String(error)
    : "";
}

/** True when the browser refused/aborted the request before an answer arrived. */
export function isTransportFailure(error: unknown): boolean {
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && CUT_SHORT.has(name)) return true;
  }
  return TRANSPORT_MESSAGES.has(messageOf(error).trim());
}

/**
 * Postgres's OWN words for "I could not answer", verbatim. Matched at the start
 * of the message so a sentence one of our functions raised — which may quote a
 * timeout while explaining what to do — is never rewritten out from under it.
 * These are the strings that reach the browser when the SQLSTATE is lost on the
 * way (a message that was stringified into a plain `Error`, for instance).
 */
const RAW_ENGINE_MESSAGES =
  /^\s*(canceling statement due to|canceling authentication request|terminating connection due to|remaining connection slots are reserved|sorry, too many clients|too many connections|deadlock detected|could not serialize access|server closed the connection unexpectedly|the database system is (starting up|shutting down|in recovery)|ssl connection has been closed unexpectedly|connection to server .* failed)/i;

/** What kind of "the database did not answer" this is. */
export type DatabaseRefusal = "timeout" | "busy" | "conflict" | "dropped";

function codeOf(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "";
}

/**
 * Classify by SQLSTATE first — the code is the engine's own, unambiguous
 * statement about which of its machinery refused. Only these four classes
 * qualify: every one of them means "the engine could not complete this run",
 * never "your data or your permissions are wrong", and for every one of them a
 * retry is the honest remedy. A `42501` (permission denied) or a `P0001` our
 * own function raised is NOT here, deliberately — those are decisions, not
 * refusals, and the caller owns what to say about them.
 */
export function databaseRefusal(error: unknown): DatabaseRefusal | null {
  const code = codeOf(error);
  if (code === "57014") return "timeout";
  if (code.startsWith("57")) return "busy"; // operator intervention / shutdown
  if (code.startsWith("53")) return "busy"; // insufficient resources
  if (code.startsWith("40")) return "conflict"; // serialization / deadlock
  if (code.startsWith("08")) return "dropped"; // connection exception

  const raw = messageOf(error);
  if (!RAW_ENGINE_MESSAGES.test(raw)) return null;
  if (/statement timeout/i.test(raw)) return "timeout";
  if (/deadlock|serialize access/i.test(raw)) return "conflict";
  if (/connection|too many clients|connection slots/i.test(raw)) return "dropped";
  return "busy";
}

/** True when Postgres itself refused, in its own words. Never a screen's words. */
export function isDatabaseFailure(error: unknown): boolean {
  return databaseRefusal(error) !== null;
}

/** True when this device says it is offline. Never guessed on the server. */
function offline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export interface DescribeOptions {
  /**
   * What the person was doing, as a noun phrase used inside a sentence —
   * "saving this holder", "removing this binding". Defaults to "this request".
   */
  action?: string;
  /**
   * Set when trying again is harmless because the write is idempotent (an
   * upsert, a delete-if-present). It changes the remedy from "reload to see
   * which" to "just try again", so say it only when it is true.
   */
  retrySafe?: boolean;
  /** Fallback sentence for a thrown thing that carries no message at all. */
  fallback?: string;
}

/**
 * What each database refusal says, and what it honestly knows about the write.
 *
 * A statement the engine CANCELLED is a statement that rolled back — PostgREST
 * runs each request in its own transaction — so "nothing was changed" is a fact
 * here, not a comfort. A connection that DROPPED knows no such thing, so it
 * carries the same uncertainty a transport refusal does.
 */
function databaseSentence(
  refusal: DatabaseRefusal,
  action: string,
  options: DescribeOptions,
): Omit<FailureSentence, "raw"> {
  switch (refusal) {
    case "timeout":
      return {
        sentence: `The database took too long to answer while ${action}, so it stopped part-way — nothing was changed.`,
        remedy: "Try again — this usually clears on its own.",
        transient: true,
      };
    case "busy":
      return {
        sentence: `The database was too busy to answer while ${action}, so it stopped part-way — nothing was changed.`,
        remedy: "Try again in a moment.",
        transient: true,
      };
    case "conflict":
      return {
        sentence: `Something else changed the same thing while ${action}, so this was rolled back.`,
        remedy: "Try again — you will be working from the newer version.",
        transient: true,
      };
    case "dropped":
      return {
        sentence: `The connection to the database dropped while ${action} — the answer never arrived, so this may or may not have gone through.`,
        remedy: options.retrySafe
          ? "Try again — doing it twice changes nothing."
          : "Try again, then reload to confirm which way it landed.",
        transient: true,
      };
  }
}

/**
 * The one place a caught error becomes what a screen prints. A door's own
 * sentence is returned unchanged and marked non-transient; a transport refusal
 * and a database refusal are rewritten, because neither is anybody's sentence.
 */
export function describeFailure(
  error: unknown,
  options: DescribeOptions = {},
): FailureSentence {
  const raw = messageOf(error);
  const action = options.action ?? "this request";

  const refusal = databaseRefusal(error);
  if (refusal) {
    return { ...databaseSentence(refusal, action, options), raw };
  }

  if (!isTransportFailure(error)) {
    return {
      sentence: raw.trim() || options.fallback || "Something went wrong.",
      remedy: "",
      transient: false,
      raw,
    };
  }

  if (offline()) {
    return {
      sentence: `This device is offline, so ${action} never left the browser — nothing was changed.`,
      remedy: "Reconnect and try again.",
      transient: true,
      raw,
    };
  }

  return {
    sentence: `The connection dropped while ${action} — the server's answer never arrived, so this may or may not have gone through.`,
    remedy: options.retrySafe
      ? "Try again — doing it twice changes nothing."
      : "Try again, then reload to confirm which way it landed.",
    transient: true,
    raw,
  };
}

/** The sentence and its remedy as one printable line. */
export function failureLine(
  error: unknown,
  options: DescribeOptions = {},
): string {
  const { sentence, remedy } = describeFailure(error, options);
  return remedy ? `${sentence} ${remedy}` : sentence;
}
