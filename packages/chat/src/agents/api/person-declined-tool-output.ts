/**
 * THE ONE SHAPE OF "THE PERSON SAID NO" IN A TOOL RESULT.
 *
 * A person pressing "Keep as is" (or Refuse, or Skip) on an approval card is
 * an ANSWER, not a failure. The model must receive it as a normal tool result
 * that names what the person chose, so it neither retries the write nor tells
 * the person "something went wrong".
 *
 * Why there is no `ok` key — the wire protocol, not taste: the server's
 * `POST /ai/conversations/{id}/tool_results` reads a non-error output carrying
 * `ok: false` as a client tool that mislabelled its own failure
 * (`aidream/services/ai_execution/tool_results.py`
 * `_misclassified_failure_code`). It flips the result to an ERROR, replaces the
 * whole payload with "Client tool error" (`error_message` "Client tool
 * reported failure: client_reported_failure.") and records a system error. On
 * 2026-10-01 that is how a note decline reached the agent as "the page reported
 * a failure and didn't say why". A decline therefore states its outcome in
 * `status` and `declined`, never in `ok`.
 *
 * Every approval path builds its decline here: surface writes
 * (`surface-write-tool-output.ts`, which `apply_surface_write` and
 * `board_item_act` share) and the War Room dispatcher.
 */

export const PERSON_DECLINED_STATUS = "declined_by_person" as const;

export interface PersonDeclinedToolOutput {
  [key: string]: unknown;
  status: typeof PERSON_DECLINED_STATUS;
  declined: true;
  /** Machine-readable outcome, e.g. `kept_as_is`, `skipped`, `declined_with_instructions`. */
  reason: string;
  /** One self-contained sentence the model reads. */
  message: string;
  /** What the person typed instead of approving, when they did. */
  instructions?: string;
}

export function personDeclinedToolOutput(input: {
  reason: string;
  message: string;
  instructions?: string;
}): PersonDeclinedToolOutput {
  return {
    status: PERSON_DECLINED_STATUS,
    declined: true,
    reason: input.instructions ? "declined_with_instructions" : input.reason,
    message: input.message,
    ...(input.instructions ? { instructions: input.instructions } : {}),
  };
}

/**
 * True when the server would re-read this NON-error output as a failure — the
 * mirror of the server's classifier, used by `submitToolResult` to scream at
 * the producer before the answer is mangled.
 */
export function nonErrorOutputReadsAsFailure(output: unknown): boolean {
  return (
    typeof output === "object" &&
    output !== null &&
    !Array.isArray(output) &&
    (output as Record<string, unknown>).ok === false
  );
}
