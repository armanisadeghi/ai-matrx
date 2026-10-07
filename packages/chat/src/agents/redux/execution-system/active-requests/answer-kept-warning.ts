/**
 * A stream warning that says "the answer was delivered and kept, but the
 * provider stopped early so the end may be missing". Leaf module (no store
 * imports) so selectors on either side can read it.
 */

import type { WarningPayload } from "@ai-matrx/agents/generated/stream-events";

/** Warning codes that mean "the answer was kept, the end may be missing". */
const ANSWER_KEPT_WARNING_CODES: ReadonlySet<string> = new Set([
  "provider_recitation_stop",
  "truncated_response",
]);

export function isAnswerKeptWarning(warning: WarningPayload): boolean {
  if (ANSWER_KEPT_WARNING_CODES.has(warning.code)) return true;
  const md = warning.metadata as Record<string, unknown> | null | undefined;
  return !!md && typeof md === "object" && md.answer_kept === true;
}
