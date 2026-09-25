// features/rich-document/annotations/errors.ts
//
// What a person reads when a sidecar write or read fails: a plain sentence
// saying what did not happen and what to do. The raw error (a Postgres code, a
// guard's developer message, a network failure) is logged once with
// console.error for the Error Inspector — it is never the sentence
// (verify-RC-B11 F4: "add it to the registry + upgrade @ai-matrx/associations"
// reached a person).

export class SidecarError extends Error {
  constructor(message: string, readonly raw?: unknown) {
    super(message);
    this.name = "SidecarError";
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
  if (code === "42501" || /permission|not allowed|forbidden|cannot comment|may not/i.test(text)) {
    sentence = `You don't have permission for this here, so ${action} did not go through. Ask the owner to share it with you.`;
  } else if (code === "23514" || /invalid text_anchor|passage is invalid/i.test(text)) {
    sentence = `The text changed while you were working, so ${action} did not go through. Select the passage again and retry.`;
  } else if (/not a registered entity type|registered entity/i.test(text)) {
    sentence = `This kind of record can't take links or private notes in this version of the app yet, so ${action} did not go through. It will work after the next app update.`;
  } else if (code === "PGRST202" || code === "42883") {
    sentence = `This part isn't switched on yet, so ${action} did not go through.`;
  } else if (isTransportFailure(e)) {
    sentence = `We couldn't reach the server while ${action}. It may or may not have been saved — Retry is safe and never makes a second copy.`;
  } else {
    sentence = `Something went wrong while ${action}. Retry, or reload the page if it keeps happening.`;
  }
  return new SidecarError(sentence[0].toUpperCase() + sentence.slice(1), e);
}
