// lib/errors/writeFailure.ts — LANE GATES-TAIL (VERIFIER-21 #1n)
//
// A FAILED WRITE IS SAID IN WORDS, WITH A REMEDY — NEVER AS METHOD, PATH AND STATUS.
//
// VERIFIER-21 injected a 500 on a schedule's Pause and the person read:
//     PATCH /scheduler/tasks/2be9cc7c… 500 — "injected failure"
// That is a developer's log line on a customer's screen. The rule (a screen never lies, and
// nothing fails silently): a failure says what did not happen, why in plain words, and what to
// do — "Could not pause this schedule. The server refused (500). Try again or open the
// schedule's activity." The technical line is kept on the error (`technical`) for diagnostics.
//
// Two pieces, one per side of the wire:
//   - `WriteRefusedError` — what a hand-rolled fetch client throws for a non-2xx answer. Its
//     `message` is already a sentence, so a caller that renders `err.message` is honest too.
//   - `describeWriteFailure(err, { action, remedy })` — the words for ANY error (this one,
//     `BackendApiError`, a network failure), and `toastWriteFailure` puts them on screen.

/** A non-2xx answer from a server, with the words already chosen. */
export class WriteRefusedError extends Error {
  readonly status: number;
  /** What the server said for a person, when it said something a person can read. */
  readonly serverMessage: string | null;
  /** The developer line (method, path, status, body) — for diagnostics, never for the screen. */
  readonly technical: string;

  constructor(args: { status: number; serverMessage?: string | null; technical: string }) {
    super(refusalSentence(args.status, args.serverMessage ?? null));
    this.name = "WriteRefusedError";
    this.status = args.status;
    this.serverMessage = args.serverMessage ?? null;
    this.technical = args.technical;
  }
}

/** Pull a human sentence out of a FastAPI-style error body, or null when there is none. */
export function serverMessageFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const detail = b.detail;
  const pick = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>;
    return pick(d.user_message) ?? pick(d.message);
  }
  return pick(b.user_message) ?? pick(detail) ?? pick(b.message);
}

const LOOKS_TECHNICAL = /(^|\s)(GET|POST|PUT|PATCH|DELETE)\s+\/|https?:\/\/|\bHTTP \d{3}\b|Traceback|Exception\b/;

function refusalSentence(status: number, serverMessage: string | null): string {
  const said = serverMessage && !LOOKS_TECHNICAL.test(serverMessage) ? serverMessage : null;
  if (status === 401) return "Your sign-in has expired. Sign in again, then try again.";
  if (status === 403) return said ?? "You do not have permission to do this.";
  if (status === 404) return said ?? "It is no longer there — it may have been deleted.";
  if (status === 409 || status === 412) return said ?? "It changed while you were working. Reload to see the latest.";
  // A 5xx body is the server's own failure text, not a sentence for a person.
  if (status >= 500) return `The server refused (${status}).`;
  if (said) return `The server said: ${said.replace(/\.?$/, ".")}`;
  return `The server did not accept it (${status}).`;
}

export interface WriteFailureWords {
  /** "Could not pause this schedule." */
  title: string;
  /** Why, in words, then the remedy. */
  description: string;
}

/**
 * The words for a failed write. `action` completes "Could not …" ("pause this schedule");
 * `remedy` is what to do next ("Try again or open the schedule's activity.").
 */
export function describeWriteFailure(
  err: unknown,
  { action, remedy = "Try again." }: { action: string; remedy?: string },
): WriteFailureWords {
  const title = `Could not ${action}.`;
  let why: string;
  if (err instanceof WriteRefusedError) {
    why = err.message;
  } else if (err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number") {
    const e = err as { status: number; userMessage?: unknown };
    why = refusalSentence(e.status, typeof e.userMessage === "string" ? e.userMessage : null);
  } else if (err instanceof TypeError || (err instanceof Error && /Failed to fetch|NetworkError|Load failed/i.test(err.message))) {
    why = "The server could not be reached. Check your connection.";
  } else if (err instanceof Error && err.message && !LOOKS_TECHNICAL.test(err.message)) {
    why = err.message.replace(/\.?$/, ".");
  } else {
    why = "Something went wrong on our side.";
  }
  return { title, description: `${why} ${remedy}`.trim() };
}
