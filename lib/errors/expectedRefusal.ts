// lib/errors/expectedRefusal.ts — THE ONE PLACE AN EXPECTED REFUSAL IS TOLD APART FROM A FAILURE
//
// Some refusals are the system working: "this agent is not readable by you" (another
// organization's agent behind a conversation), "this row is in Trash" (a stale editor saving a
// row somebody archived). Every surface that meets one already tells the person. Logging it with
// console.error lit the Next dev overlay's red "1 Issue" on a page that behaved correctly
// (verifier round 3, claim 11; the Trash click-test, 2026-09-28) — and console.error is also what
// lib/diagnostics/globalErrorCapture files as an incident, so a correct refusal became a repair
// row. An expected refusal carries a code from EXPECTED_REFUSAL_CODES; `logFailure` records it as
// information and keeps console.error for failures nobody expected.
//
// Add a code here only for a refusal every caller already puts on screen. A code survives Redux
// `.unwrap()` serialization because it is a plain `code` property.

export const EXPECTED_REFUSAL_CODES = [
  /** An agent the person cannot read (features/agents — agent-not-readable.ts). */
  "agent_not_readable",
  /** An edit of a Data table row that is in Trash (features/data-tables — rowInTrash.ts). */
  "row_in_trash",
] as const;

export type ExpectedRefusalCode = (typeof EXPECTED_REFUSAL_CODES)[number];

const CODES: ReadonlySet<string> = new Set(EXPECTED_REFUSAL_CODES);

/** An Error carrying an expected-refusal code; its message is the sentence the person sees. */
export function expectedRefusal(
  code: ExpectedRefusalCode,
  message: string,
): Error & { code: ExpectedRefusalCode } {
  return Object.assign(new Error(message), { code });
}

/** The expected-refusal code on `err` — as thrown, or as serialized by `.unwrap()` — else null. */
export function expectedRefusalCode(err: unknown): ExpectedRefusalCode | null {
  if (typeof err !== "object" || err === null) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && CODES.has(code) ? (code as ExpectedRefusalCode) : null;
}

export function isExpectedRefusal(err: unknown): boolean {
  return expectedRefusalCode(err) !== null;
}

/** Log a failure: an expected refusal as information (it is on screen), anything else as an error. */
export function logFailure(tag: string, err: unknown): void {
  const code = expectedRefusalCode(err);
  if (code) {
    console.info(`${tag} expected refusal (${code}), handled on screen`, err);
    return;
  }
  console.error(tag, err);
}
