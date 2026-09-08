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
 * The one place a caught error becomes what a screen prints. A door's own
 * sentence is returned unchanged and marked non-transient; only a transport
 * refusal is rewritten.
 */
export function describeFailure(
  error: unknown,
  options: DescribeOptions = {},
): FailureSentence {
  const raw = messageOf(error);
  const action = options.action ?? "this request";

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
