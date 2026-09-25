// features/rich-document/annotations/errors.ts
//
// What a person reads when a sidecar write or read fails: a plain sentence
// saying what did not happen and what to do. The raw error (a Postgres code, a
// guard's developer message, a network failure) is logged once with
// console.error for the Error Inspector — it is never the sentence
// (verify-RC-B11 F4: "add it to the registry + upgrade @ai-matrx/associations"
// reached a person).

export class SidecarError extends Error {
  /**
   * Whether trying the same write again can succeed. False for a refusal the person cannot
   * change by retrying (a switched-off capability, a missing permission): the panel then
   * offers no Retry — a button that cannot work is a screen that lies.
   */
  readonly retryable: boolean;
  constructor(message: string, readonly raw?: unknown, retryable = true) {
    super(message);
    this.name = "SidecarError";
    this.retryable = retryable;
  }
}

/** The current text of a comment someone else changed while this person was editing it. */
export class EditConflictError extends SidecarError {
  constructor(readonly currentBody: string, readonly currentVersion: number | null) {
    super("Someone changed this comment while you were editing it.");
    this.name = "EditConflictError";
  }
}

function codeOf(e: unknown): string | undefined {
  if (!e || typeof e !== "object") return undefined;
  const c = (e as { code?: unknown }).code;
  return typeof c === "string" ? c : undefined;
}

function textOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e ?? "");
}

/** True when the failure is the connection, not the server answering (the write MAY have landed). */
export function isTransportFailure(e: unknown): boolean {
  const t = textOf(e).toLowerCase();
  const status = e && typeof e === "object" ? (e as { status?: unknown }).status : undefined;
  return (
    t.includes("failed to fetch") || t.includes("network") || t.includes("load failed") ||
    t.includes("timeout") || t.includes("timed out") || t.includes("aborted") ||
    (typeof status === "number" && status >= 500) || codeOf(e) === "" || /\b50[234]\b/.test(t)
  );
}

/**
 * `action` is what the person was doing, as a gerund phrase ("posting your comment").
 * Returns a SidecarError whose message is safe to show.
 */
export function humanError(action: string, e: unknown): SidecarError {
  if (e instanceof SidecarError) return e;
  console.error(`[annotations] ${action} failed`, e);
  const code = codeOf(e);
  const text = textOf(e);
  let sentence: string;
  let retryable = true;
  if (code === "42501" || /permission|not allowed|forbidden|cannot comment|may not/i.test(text)) {
    sentence = `You don't have permission for this here, so ${action} did not go through. Ask the owner to share it with you.`;
    retryable = false;
  } else if (code === "23514" || /invalid text_anchor|passage is invalid/i.test(text)) {
    sentence = `The text changed while you were working, so ${action} did not go through. Select the passage again and retry.`;
  } else if (/not a registered entity type|registered entity/i.test(text)) {
    sentence = `This kind of record can't take links or private notes in this version of the app yet, so ${action} did not go through. It will work after the next app update.`;
  } else if (code === "PGRST202" || code === "42883") {
    sentence = `This part isn't switched on yet, so ${action} did not go through. Your text is kept here.`;
    retryable = false;
  } else if (isTransportFailure(e)) {
    sentence = `We couldn't reach the server while ${action}. It may or may not have been saved — Retry is safe and never makes a second copy.`;
  } else {
    // Unrecognised: NAME it by its code — "something went wrong" tells the person nothing and
    // tells whoever they report it to nothing either (Arman, 2026-09-25). The server's own words
    // stay out of the sentence (developer text, verify-RC-B11 F4); they are in the console
    // record above and in the error display's copy-for-AI.
    const status = e && typeof e === "object" ? (e as { status?: unknown }).status : undefined;
    const ref = code ? `error ${code}` : typeof status === "number" ? `HTTP ${status}` : e instanceof Error && e.name !== "Error" ? e.name : "";
    sentence = `${action} did not go through — the server refused it${ref ? ` (${ref})` : " without saying why"}. Retry, or reload the page if it keeps happening.`;
  }
  return new SidecarError(sentence[0].toUpperCase() + sentence.slice(1), e, retryable);
}
