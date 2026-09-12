/**
 * WHY A RUN FORM WOULD NOT LOAD — in words the reader can act on.
 *
 * 🚨 THE DEFECT THIS CLOSES (Masterwork "Verification Desk", 2026-09-11).
 * Six nodes of the workflow failed the server's compile gate, so
 * `GET /workflows/{id}/run-form` answered 400 — and the run box printed
 *
 *     Could not read what this asks for
 *     Bad request. Please check your input.
 *
 * The reader had typed nothing. The sentence blamed them for a workflow that
 * does not compile, and the server's six named, node-addressed reasons were
 * shown nowhere. A screen is absent or honest, never wearing a false
 * sentence (the fourth law).
 *
 * This module is the SHARED answer, not the Masterwork box's: every surface
 * built on `useServedRunForm` — the Masterwork try box, the canonical run
 * form, the trigger default-inputs editor, the bake-off commission page —
 * reads its refusal through here, so none of them can go back to a generic
 * sentence on its own.
 *
 * It never invents a reason. When the server explains itself, the server's
 * words win; when it does not, the missing explanation is named AS the defect
 * rather than papered over.
 *
 * 🚨 THE RULE ITSELF NOW LIVES ONE LAYER DOWN (FIX-Q8, 2026-09-11). The same
 * defect reappeared on the mandate input surface as *"The job's inputs could
 * not be read: HTTP 400"* — a second door, the same class. So "the server's
 * words win, a transport default is not an explanation" is
 * `lib/api/door-refusal.ts`, and this module is the RUN FORM's reading of it:
 * its fallback sentence and its `definition_does_not_compile` discriminator.
 */

import {
  describeDoorRefusal,
  doorBody,
  type DoorApiError,
} from "@/lib/api/door-refusal";

/** The error shape `callApi` hands back on a failed request. */
export type RunFormApiError = DoorApiError;

export interface RunFormFailure {
  /** The sentence to print. Never a sentence that blames the reader. */
  message: string;
  /** One line per problem the server named, ready to render as a list. */
  issues: string[];
  /** The server sent a real reason (as opposed to a bare status). */
  serverExplained: boolean;
  /** This workflow does not compile — the fix is in the workflow, not here. */
  doesNotCompile: boolean;
}

/**
 * Printed ONLY when the server refused without saying why. It names the
 * missing reason as the defect, because that is what it is — a server that
 * answers an error with no readable message is itself a bug worth reporting.
 */
export const GENERIC_REFUSAL_FALLBACK =
  "The server would not serve this workflow's inputs and sent no reason " +
  "with it — the missing reason is itself a defect worth reporting. Reload " +
  "and try once more; if it repeats, report it.";

/** The `error` discriminator the run-form endpoint uses for a compile refusal. */
const DOES_NOT_COMPILE = "definition_does_not_compile";

export function describeRunFormFailure(
  error: RunFormApiError | null | undefined,
): RunFormFailure {
  const refusal = describeDoorRefusal(error, {
    fallback: GENERIC_REFUSAL_FALLBACK,
  });
  const detail = doorBody(error?.serverDetail);
  const doesNotCompile =
    typeof detail?.error === "string" &&
    detail.error.trim() === DOES_NOT_COMPILE;

  return {
    message: refusal.message,
    issues: refusal.issues,
    serverExplained: refusal.serverExplained,
    doesNotCompile,
  };
}

/**
 * The `<ServedFormScream>` props for a failed run-form fetch — ONE place, so
 * the Masterwork try box, the canonical run form, the trigger editor and the
 * commission page cannot say four different things about the same refusal.
 *
 * `surfaceNote` is the surface's own technical tail ("the run form is SERVED
 * (GET …) — without it there is nothing honest to render"). It is appended
 * only when the refusal is NOT a compile failure: when the workflow does not
 * compile, the reader needs the workflow's problems, and a note about which
 * endpoint serves the form — or worse, about the fields below being a
 * fallback pair — is noise at best and a false accusation at worst. That is
 * the exact sentence that greeted the "Verification Desk" reader on
 * 2026-09-11 while they had typed nothing at all.
 */
export function runFormScreamProps(
  failure: RunFormFailure,
  options: { title: string; surfaceNote?: string },
): { title: string; body: string; issues: string[] } {
  if (failure.doesNotCompile) {
    return {
      title: "This workflow cannot run yet",
      body: failure.message,
      issues: failure.issues,
    };
  }
  const note = options.surfaceNote ? ` ${options.surfaceNote}` : "";
  return {
    title: options.title,
    body: `${failure.message}${note}`,
    issues: failure.issues,
  };
}
