// features/mandates/door-error.ts
//
// THE DATABASE'S OWN WORDS, CARRIED OUT INTACT.
//
// Every mandate door in the one-resolution campaign refuses in sentences
// written for a person — a message, a reason (`detail`), and a remedy
// (`hint`) — and the campaign's whole point is that no screen invents a
// second opinion. Swallowing a refusal into an empty list or a generic
// "something went wrong" re-creates exactly the defect REVIEW-one-resolution.md
// §8b names: a screen that looks the same for two completely different reasons.
//
// This is the ONE shape those refusals travel in. It exists because there is
// now more than one door: `public.mnd_list_scoped` (the list door, L2) and
// `mandate.duplicate_mandate` (the promotion door, L3). Each keeps its own
// class name so a `catch` can still tell them apart, but the body — how a
// PostgREST error becomes a printable sentence — is written once.

/** The shape PostgREST hands back on a raised exception. */
export interface DoorErrorFields {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * A refusal or failure from a mandate door. `message` is what a screen prints:
 * the sentence plus the reason, both written for a person. `hint` is the
 * door's remedy — it names the next door, so it is printable too when the
 * remedy is something a person can act on.
 */
export class MandateDoorError extends Error {
  readonly code: string | null;
  readonly detail: string | null;
  readonly hint: string | null;
  /** True when the door REFUSED this caller (42501), rather than failing. */
  readonly refused: boolean;

  constructor(init: {
    /** Class name, so a `catch` can still tell the doors apart. */
    name?: string;
    /** What a screen prints when everything else is empty. */
    fallback?: string;
    message: string;
    code?: string | null;
    detail?: string | null;
    hint?: string | null;
  }) {
    const sentence = [init.message?.trim(), init.detail?.trim()]
      .filter((part): part is string => Boolean(part))
      .join(" ");
    super(
      sentence ||
        init.fallback ||
        "A mandate door returned an error with no message — usually a gateway/PostgREST failure rather than a query error.",
    );
    this.name = init.name ?? "MandateDoorError";
    this.code = init.code ?? null;
    this.detail = init.detail ?? null;
    this.hint = init.hint ?? null;
    this.refused = init.code === "42501";
  }
}

/** True when a door said "not yours", as opposed to a read that broke. */
export function isMandateDoorRefusal(error: unknown): boolean {
  return error instanceof MandateDoorError && error.refused;
}
