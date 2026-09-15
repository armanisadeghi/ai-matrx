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

import { describeDoorRefusal, doorBody } from "@/lib/api/door-refusal";

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
    {
      fallback: code
        ? `The server refused this and sent no explanation (${code}).`
        : "The server refused this and sent no explanation.",
    },
  );

  return {
    code,
    message: described.message,
    issues: described.issues,
    status,
  };
}
