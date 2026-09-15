/**
 * serverRefusal — the server's own refusal, rendered verbatim.
 *
 * 🚨 THE CLASS THIS CLOSES (V-XT-2/N2, 2026-09-15). Opening
 * `/work/conversations/<id>` as an account that does not own the conversation
 * rendered: *"We couldn't load this conversation — **You do have access to
 * it** — something went wrong on our side. Try again."* The server's answer
 * had been a clean `404 conversation_not_found`. The screen converted an
 * authorization refusal into a false claim of access, a phantom fault on our
 * side, and an invitation to retry that could never succeed.
 *
 * The rule this file exists to hold: **a surface never asserts access it did
 * not get.** When a door refused in words, those words are what the person
 * reads — never a sentence the client composed about what it believes the
 * person's access to be.
 *
 * It is a thin adapter over `lib/api/door-refusal.ts`, which already owns the
 * reading of a refusal body (the server's `user_message` first, never a bare
 * transport code, never "check your input"). This adds the two things an
 * access surface needs on top: the machine CODE, so the refusal is
 * identifiable when somebody reports it, and a null answer for failures that
 * are not refusals at all, so a genuine fault keeps its retry.
 */

import {
  describeDoorRefusal,
  doorBody,
  isBareTransportCode,
} from "@/lib/api/door-refusal";

export interface ServerRefusal {
  /** The server's machine code — `conversation_not_found`, `forbidden`, … */
  code: string | null;
  /** The server's own sentence, verbatim. Never re-worded, never templated. */
  message: string;
  /** One line per problem the server named. */
  issues: string[];
  /** HTTP status, when the error carried one. */
  status: number | null;
}

/**
 * A sentence that blames the reader for the server's own refusal is never
 * printed — the same rule `lib/api/door-refusal.ts` holds for door bodies.
 */
const BLAMES_THE_READER = /check your input/i;

/** Naming the silence, with the code that identifies it. Never a reason we invented. */
function silentRefusalSentence(code: string | null): string {
  return code
    ? `The server refused this and sent no explanation (${code}).`
    : "The server refused this and sent no explanation.";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * The refusal an error carries, or `null` when it carries none.
 *
 * `null` means "this was not a door saying no" — a network fault, a null-row
 * RLS read, a thrown TypeError. Those keep the platform's own explanation and
 * their retry; only a real refusal replaces the copy.
 */
export function readServerRefusal(error: unknown): ServerRefusal | null {
  if (!isRecord(error)) return null;

  const status = typeof error.status === "number" ? error.status : null;
  const detail = doorBody(error.serverDetail);
  const code = str(detail?.code) || null;

  // A refusal is a door answering with its OWN words or its own code. A bare
  // status with an empty body is a fault as far as a person is concerned, and
  // `describeDoorRefusal` would only hand back the caller's fallback.
  const hasServerWords = Boolean(
    str(detail?.user_message) || str(detail?.message) || code,
  );
  if (!hasServerWords) return null;

  const described = describeDoorRefusal(
    {
      status: status ?? undefined,
      message: str(error.message) || undefined,
      serverDetail: error.serverDetail,
    },
    // Only reached when the body carried a code but no sentence. Naming the
    // silence is the honest move — never inventing a reason for it.
    { fallback: silentRefusalSentence(code) },
  );

  return {
    code,
    message: described.message,
    issues: described.issues,
    status,
  };
}

/**
 * The same refusal, read off an error that is ALREADY typed by its own client
 * — `@ai-matrx/associations`' `{code, message, hint}`, and anything shaped
 * like it. Kept beside `readServerRefusal` so there is still ONE place that
 * decides how a server refusal reads; what differs is only where the code and
 * the sentence were found.
 *
 * Deliberately a separate entrance rather than widening `readServerRefusal`:
 * a raw PostgREST error is also `{code, message}`, and printing `PGRST116` or
 * an RLS message verbatim at a person is the opposite of what this feature is
 * for. A caller that holds a typed refusal says so.
 */
export function readTypedRefusal(error: unknown): ServerRefusal | null {
  if (!isRecord(error)) return null;
  const code = str(error.code) || null;
  // 🚨 READ THE TOP LEVEL, NEVER `detail`. A typed client's `detail` carries
  // the RAW cause it mapped FROM — for `@ai-matrx/associations` that is the
  // PostgREST body, whose code is `42501` and whose sentence is
  // "assoc_add: editor access to both endpoints is required for an
  // access-conveying edge". Both are machine text: the code a person would
  // report is the mapped one (`forbidden_org`), and pg prose must never reach
  // a screen. Going through `doorBody` unwrapped exactly that and printed it
  // (caught by this module's own test, 2026-09-15).
  const message = str(error.user_message) || str(error.message);
  if (!code && !message) return null;

  const usable =
    message.length > 0 &&
    !BLAMES_THE_READER.test(message) &&
    !isBareTransportCode(message);

  return {
    code,
    message: usable ? message : silentRefusalSentence(code),
    issues: [],
    status: typeof error.status === "number" ? error.status : null,
  };
}
